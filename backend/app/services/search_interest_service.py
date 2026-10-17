"""Google Trends search interest: a second signal next to news coverage.

What is fetched
  For each trend, the daily Google search interest for its name over the last 90 days (worldwide, or one
  market via SEARCH_GEO). Google reports 0-100 where 100 is that keyword's own peak in the window, so the
  numbers show how interest is moving, not how many people search. Low-volume terms come back as no data.

How it's used in the score (trend_service._compute_scores)
  search momentum = log(1 + recent level) x growth ratio (clamped 0.25x-4x), where recent level is the last
  28 days' average (0-100, i.e. how close to its 3-month high it is now) and growth compares it with the 28
  days before. Like every other component it's turned into a percentile rank across trends that have data.
  Trends without fresh data simply leave the component out and the other weights are rescaled.

Being polite to Google
  Google Trends has no official API; this uses the same public endpoints as its website. It blocks clients
  that ask too often (HTTP 429), so each run checks a few trends (SEARCH_TRENDS_PER_RUN), pauses between them,
  refreshes each one only every SEARCH_REFRESH_HOURS, and stops for the run at the first refusal.

Where the lookups run
  Google refuses requests from Render's servers outright, so in production the GitHub Actions job does the
  lookups (backend/scripts/fetch_search_interest.py): it asks GET /api/jobs/search-queue for the next trends,
  queries Google from the GitHub runner and sends the series to POST /api/jobs/search-results, which stores
  them with store_result(). refresh_search_interest() does the same in-process, for local runs and Celery;
  the API's scheduled tick only uses it when SEARCH_FETCH_IN_API is on.
"""
import json
import logging
import math
import time
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import or_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Trend, TrendSearchInterest

log = logging.getLogger("trendscope.search")

BASE = "https://trends.google.com/trends"
TIMEFRAME = "today 3-m"
WINDOW_DAYS = 28
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/141.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


class SearchRateLimited(Exception):
    """Google refused the request (HTTP 429). Stop for this run and try again later."""


class SearchFetchError(Exception):
    pass


def _json(text: str) -> dict:
    """Google prefixes its JSON with junk like )]}' to stop it being run as a script."""
    start = text.find("{")
    if start < 0:
        raise SearchFetchError("unexpected response")
    return json.loads(text[start:])


class GoogleTrendsClient:
    def __init__(self, timeout: float = 20):
        self.http = httpx.Client(headers=HEADERS, follow_redirects=True, timeout=timeout)
        self._warmed = False

    def close(self):
        self.http.close()

    def _get(self, url: str, params: dict) -> str:
        if not self._warmed:
            # Sets the NID cookie Google expects; this page itself often answers 429, which is fine
            try:
                self.http.get(f"{BASE}/explore", params={"geo": "US"})
            except httpx.HTTPError:
                pass
            self._warmed = True
        try:
            r = self.http.get(url, params=params)
        except httpx.HTTPError as exc:
            raise SearchFetchError(f"{type(exc).__name__}: {exc}") from exc
        if r.status_code == 429:
            raise SearchRateLimited("Google Trends rate limit")
        if r.status_code != 200:
            raise SearchFetchError(f"HTTP {r.status_code}")
        return r.text

    def interest_over_time(self, keyword: str, geo: str = "") -> list[tuple[str, int]]:
        """Daily (iso date, 0-100) for the last ~90 days, complete days only. Empty when Google has no data."""
        req = {"comparisonItem": [{"keyword": keyword, "geo": geo, "time": TIMEFRAME}], "category": 0, "property": ""}
        explore = _json(self._get(f"{BASE}/api/explore", {"hl": "en-US", "tz": "0", "req": json.dumps(req)}))
        widget = next((w for w in explore.get("widgets", []) if w.get("id") == "TIMESERIES"), None)
        if not widget:
            raise SearchFetchError("no time series widget")
        data = _json(self._get(f"{BASE}/api/widgetdata/multiline", {
            "hl": "en-US", "tz": "0", "req": json.dumps(widget["request"]), "token": widget["token"],
        }))
        points = []
        for p in data.get("default", {}).get("timelineData", []):
            if p.get("isPartial") or not p.get("hasData", [True])[0]:
                continue
            day = datetime.fromtimestamp(int(p["time"]), timezone.utc).date().isoformat()
            points.append((day, int(p["value"][0])))
        return points


def summarize(series: list[tuple[str, int]]) -> dict:
    """Recent vs previous 28-day averages. has_data is False when Google reported nothing above zero."""
    values = [v for _, v in series]
    if not values or max(values) == 0:
        return {"has_data": False, "recent_avg": None, "previous_avg": None, "growth_pct": None}
    recent = values[-WINDOW_DAYS:]
    previous = values[-2 * WINDOW_DAYS:-WINDOW_DAYS]
    recent_avg = sum(recent) / len(recent)
    previous_avg = sum(previous) / len(previous) if previous else None
    growth = round((recent_avg / previous_avg - 1) * 100, 1) if previous_avg else None
    return {
        "has_data": True, "recent_avg": round(recent_avg, 1),
        "previous_avg": round(previous_avg, 1) if previous_avg is not None else None, "growth_pct": growth,
    }


def momentum(recent_avg: float | None, previous_avg: float | None) -> float:
    """Raw search component before percentile ranking (see module docstring)."""
    if not recent_avg:
        return 0.0
    ratio = (recent_avg + 1) / ((previous_avg or 0) + 1)
    return math.log1p(recent_avg) * min(4.0, max(0.25, ratio))


def _upsert(db: Session, row: dict):
    stmt = insert(TrendSearchInterest).values(row)
    db.execute(stmt.on_conflict_do_update(
        constraint="uq_trend_search_interest_trend_geo",
        set_={k: stmt.excluded[k] for k in row if k not in ("trend_id", "geo")},
    ))


def stale_trends(db: Session, limit: int, geo: str) -> list[tuple[str, str]]:
    """Top-scored active trends whose search data is missing, older than SEARCH_REFRESH_HOURS, or whose last
    lookup failed more than SEARCH_RETRY_HOURS ago."""
    now = datetime.now(timezone.utc)
    refresh_cutoff = now - timedelta(hours=settings.SEARCH_REFRESH_HOURS)
    retry_cutoff = now - timedelta(hours=settings.SEARCH_RETRY_HOURS)
    return (
        db.query(Trend.id, Trend.name)
        .outerjoin(TrendSearchInterest, (TrendSearchInterest.trend_id == Trend.id) & (TrendSearchInterest.geo == geo))
        .filter(Trend.trend_score > 0, or_(
            TrendSearchInterest.id.is_(None),
            TrendSearchInterest.fetched_at < refresh_cutoff,
            TrendSearchInterest.error.isnot(None) & (TrendSearchInterest.fetched_at < retry_cutoff),
        ))
        .order_by(Trend.trend_score.desc())
        .limit(limit)
        .all()
    )


def store_result(db: Session, trend_id: str, keyword: str, geo: str, series: list[tuple[str, int]] | None,
                 error: str | None = None) -> dict:
    """Save one lookup. A failed lookup is recorded too, so one bad keyword doesn't block the queue."""
    summary = summarize(series or []) if error is None else \
        {"has_data": False, "recent_avg": None, "previous_avg": None, "growth_pct": None}
    _upsert(db, {"trend_id": trend_id, "geo": geo, "keyword": keyword, "fetched_at": datetime.now(timezone.utc),
                 "series": [list(p) for p in series] if series and error is None else None,
                 **summary, "error": error[:300] if error else None})
    return summary


def refresh_search_interest(db: Session, limit: int | None = None, client: GoogleTrendsClient | None = None) -> dict:
    """Fetch search interest for the next few stale trends. Commits after each trend."""
    if not settings.SEARCH_INTEREST_ENABLED:
        return {"skipped": "disabled"}
    geo = settings.SEARCH_GEO
    todo = stale_trends(db, limit or settings.SEARCH_TRENDS_PER_RUN, geo)
    own_client = client is None
    client = client or GoogleTrendsClient()
    result = {"checked": 0, "with_data": 0, "errors": 0, "rate_limited": False}
    try:
        for i, (trend_id, name) in enumerate(todo):
            if i:
                time.sleep(settings.SEARCH_DELAY_SECONDS)
            try:
                series = client.interest_over_time(name, geo)
            except SearchRateLimited:
                result["rate_limited"] = True
                break
            except (SearchFetchError, ValueError, KeyError) as exc:
                log.warning("search interest for %r failed: %s", name, exc)
                store_result(db, trend_id, name, geo, None, str(exc))
                db.commit()
                result["errors"] += 1
                continue
            summary = store_result(db, trend_id, name, geo, series)
            db.commit()
            result["checked"] += 1
            result["with_data"] += summary["has_data"]
    finally:
        if own_client:
            client.close()
    return result


def fresh_search_momentum(db: Session) -> dict[str, float]:
    """trend_id -> raw search momentum, for trends with search data newer than SEARCH_MAX_AGE_DAYS.

    Returns {} until at least SEARCH_MIN_TRENDS trends have data, so a handful of early fetches can't
    swing the percentile ranking.
    """
    if not settings.SEARCH_INTEREST_ENABLED:
        return {}
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.SEARCH_MAX_AGE_DAYS)
    rows = db.query(TrendSearchInterest.trend_id, TrendSearchInterest.has_data, TrendSearchInterest.recent_avg,
                    TrendSearchInterest.previous_avg).filter(
        TrendSearchInterest.geo == settings.SEARCH_GEO, TrendSearchInterest.fetched_at >= cutoff,
        TrendSearchInterest.error.is_(None),
    ).all()
    if sum(1 for r in rows if r.has_data) < settings.SEARCH_MIN_TRENDS:
        return {}
    return {r.trend_id: momentum(r.recent_avg, r.previous_avg) if r.has_data else 0.0 for r in rows}


def search_detail(db: Session, trend_id: str) -> dict | None:
    """Search interest block for the trend detail page."""
    row = db.query(TrendSearchInterest).filter(
        TrendSearchInterest.trend_id == trend_id, TrendSearchInterest.geo == settings.SEARCH_GEO).first()
    if not row or row.error:
        return None
    return {
        "keyword": row.keyword, "geo": row.geo, "fetched_at": row.fetched_at, "has_data": row.has_data,
        "recent_avg": row.recent_avg, "previous_avg": row.previous_avg, "growth_pct": row.growth_pct,
        "series": [{"date": d, "value": v} for d, v in (row.series or [])],
    }
