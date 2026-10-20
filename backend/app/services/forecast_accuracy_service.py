"""Forecast accuracy: save every forecast, check it 7 days later, report hit rates.

Recording
  live      update_forecasts() saves each trend's forecast once a day (the first one that day is kept, so it was
            genuinely made in advance). Trends labelled too_early are not recorded: they made no call.
  backtest  backtest_forecasts() replays forecast_trend() on stored daily snapshots for past days. It gives a hit
            rate before a week of live forecasts exists, but it is weaker evidence (the score history it replays was
            partly rebuilt afterwards), so the two are always reported separately.

Checking (after due_on = made_on + 7 days has passed)
  actual score = the trend's snapshot on due_on, or 0 when the engine ran that day but the trend had no score
  (it faded). If the engine didn't run on due_on, the nearest day within a day either side is used; with no
  data at all the record becomes outcome "no_data" and is left out of the rates.

What counts as a hit (change = actual - start, in score points)
  breaking_out    change >= +3       it kept climbing
  declining       change <= -3       it kept falling
  likely_to_peak  change <  +3       the climb stopped
  sustained       change >= -5       it held its level
  steady          |change| <= 5      it didn't move much

The projected score is also measured: mean absolute error against the actual score, next to the error of the
naive "nothing changes" guess (actual vs start). A forecast that can't beat the naive guess isn't adding value.
"""
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import Integer, case, cast, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import ForecastRecord, Trend, TrendSnapshot

HORIZON_DAYS = 7
MOVE = 3.0      # points of change that count as "moved" for breaking_out / declining / likely_to_peak
BAND = 5.0      # tolerance for sustained / steady
NO_DATA_AFTER = 3  # days past due_on to wait for a snapshot before giving up
BACKTEST_DAYS = 45
CONFIDENCE_BANDS = [("low", 0.0, 0.3), ("medium", 0.3, 0.6), ("high", 0.6, 1.01)]

HIT_RULES = {
    "breaking_out": "Score rose 3+ points within a week.",
    "likely_to_peak": "Score stopped climbing (rose less than 3 points).",
    "sustained": "Score held its level (fell no more than 5 points).",
    "steady": "Score stayed within 5 points.",
    "declining": "Score fell 3+ points.",
}


def is_hit(label: str, start: float, actual: float) -> bool:
    change = actual - start
    if label == "breaking_out":
        return change >= MOVE
    if label == "declining":
        return change <= -MOVE
    if label == "likely_to_peak":
        return change < MOVE
    if label == "sustained":
        return change >= -BAND
    if label == "steady":
        return abs(change) <= BAND
    return False


def _insert(db: Session, rows: list[dict]) -> int:
    written = 0
    for i in range(0, len(rows), 1000):
        stmt = insert(ForecastRecord).values(rows[i:i + 1000]).on_conflict_do_nothing(
            constraint="uq_forecast_records_trend_day_source").returning(ForecastRecord.id)
        written += len(db.execute(stmt).all())  # rowcount is -1 for this statement on psycopg
    return written


def record_forecasts(db: Session, today: date, forecasts: list[dict]) -> int:
    """forecasts: dicts with trend_id, score, status and the forecast_trend() result under "forecast"."""
    rows = [
        {
            "trend_id": f["trend_id"], "source": "live", "made_on": today,
            "due_on": today + timedelta(days=HORIZON_DAYS), "label": f["forecast"]["label"],
            "start_score": f["score"], "start_status": f["status"],
            "projected_score": f["forecast"]["projected_score_7d"], "confidence": f["forecast"]["confidence"],
        }
        for f in forecasts if f["forecast"] and f["forecast"]["label"] in HIT_RULES
    ]
    return _insert(db, rows)


def backtest_forecasts(db: Session, today: date, days: int = BACKTEST_DAYS) -> int:
    """Replay the forecast for each past day that can already be checked. Safe to re-run."""
    from app.services.forecast_service import forecast_trend  # forecast_service imports this module

    first_day = today - timedelta(days=days)
    snaps: dict[str, dict[date, tuple]] = defaultdict(dict)
    for trend_id, day, score, status, mentions in (
        db.query(TrendSnapshot.trend_id, TrendSnapshot.date, TrendSnapshot.trend_score,
                 TrendSnapshot.status, TrendSnapshot.mentions_7d)
        .filter(TrendSnapshot.date >= first_day - timedelta(days=13))
    ):
        snaps[trend_id][day] = (score, status, mentions)

    rows = []
    last_day = today - timedelta(days=HORIZON_DAYS + 1)  # its due day must be complete
    day = first_day
    while day <= last_day:
        for trend_id, by_day in snaps.items():
            current = by_day.get(day)
            if not current or not current[0]:
                continue
            window = [(d, v) for d, v in by_day.items() if day - timedelta(days=13) <= d <= day]
            history = sorted(((d - day).days, v[0]) for d, v in window)
            # mentions_30d isn't stored per day: the busiest 7-day count in the window is a lower bound for it
            stories = max(v[2] or 0 for _, v in window)
            f = forecast_trend(current[0], current[1], stories, history)
            if f["label"] not in HIT_RULES:
                continue
            rows.append({
                "trend_id": trend_id, "source": "backtest", "made_on": day,
                "due_on": day + timedelta(days=HORIZON_DAYS), "label": f["label"],
                "start_score": current[0], "start_status": current[1],
                "projected_score": f["projected_score_7d"], "confidence": f["confidence"],
            })
        day += timedelta(days=1)
    return _insert(db, rows)


def resolve_due(db: Session, today: date) -> dict:
    """Check every pending forecast whose due day has passed."""
    pending = (
        db.query(ForecastRecord)
        .filter(ForecastRecord.outcome.is_(None), ForecastRecord.due_on < today)
        .all()
    )
    if not pending:
        return {"resolved": 0}

    due_days = {r.due_on for r in pending}
    lookup_days = {d + timedelta(days=k) for d in due_days for k in (-1, 0, 1)}
    engine_days = {d for (d,) in db.query(TrendSnapshot.date).filter(TrendSnapshot.date.in_(lookup_days)).distinct()}
    trend_ids = {r.trend_id for r in pending}
    snaps = {
        (t, d): (score, status)
        for t, d, score, status in db.query(
            TrendSnapshot.trend_id, TrendSnapshot.date, TrendSnapshot.trend_score, TrendSnapshot.status
        ).filter(TrendSnapshot.date.in_(lookup_days), TrendSnapshot.trend_id.in_(trend_ids))
    }

    counts = defaultdict(int)
    for r in pending:
        check_day = next((d for d in (r.due_on, r.due_on + timedelta(days=1), r.due_on - timedelta(days=1))
                          if d in engine_days and d < today), None)
        if check_day is None:
            if (today - r.due_on).days > NO_DATA_AFTER:
                r.outcome, r.resolved_on = "no_data", today
                counts["no_data"] += 1
            continue
        actual, status = snaps.get((r.trend_id, check_day), (0.0, "faded"))
        r.actual_score, r.actual_status = actual, status
        r.hit = is_hit(r.label, r.start_score, actual)
        r.outcome = "hit" if r.hit else "miss"
        r.projection_error = round(abs(r.projected_score - actual), 2)
        r.naive_error = round(abs(r.start_score - actual), 2)
        r.resolved_on = today
        counts[r.outcome] += 1
    return {"resolved": counts["hit"] + counts["miss"], **counts}


def track(db: Session, today: date, forecasts: list[dict]) -> dict:
    """Called by update_forecasts() on every engine run. The caller commits."""
    result = {"recorded": record_forecasts(db, today, forecasts)}
    # Backtest once a day: only when the newest checkable day hasn't been replayed yet
    newest = today - timedelta(days=HORIZON_DAYS + 1)
    if not db.query(ForecastRecord.id).filter(ForecastRecord.source == "backtest", ForecastRecord.made_on == newest).first():
        result["backtested"] = backtest_forecasts(db, today)
    db.flush()
    result.update(resolve_due(db, today))
    return result


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def _rate(hits: int, total: int) -> float | None:
    return round(hits / total, 3) if total else None


def _summary(db: Session, source: str) -> dict:
    checked = db.query(ForecastRecord).filter(ForecastRecord.source == source, ForecastRecord.outcome.in_(("hit", "miss")))
    hits_expr = func.sum(cast(ForecastRecord.hit, Integer))

    total, hits, mae, naive = checked.with_entities(
        func.count(ForecastRecord.id), hits_expr,
        func.avg(ForecastRecord.projection_error), func.avg(ForecastRecord.naive_error),
    ).one()
    total, hits = total or 0, hits or 0

    by_label = {
        label: {"checked": n, "hits": h or 0, "hit_rate": _rate(h or 0, n)}
        for label, n, h in checked.with_entities(ForecastRecord.label, func.count(ForecastRecord.id), hits_expr)
        .group_by(ForecastRecord.label)
    }

    # Grouped by label: the same expression repeated in GROUP BY would get different bind parameters
    band = case(*[(ForecastRecord.confidence < hi, name) for name, _, hi in CONFIDENCE_BANDS], else_="high").label("band")
    by_conf = {
        name: {"checked": n, "hits": h or 0, "hit_rate": _rate(h or 0, n)}
        for name, n, h in checked.with_entities(band, func.count(ForecastRecord.id), hits_expr).group_by("band")
    }

    week = func.date_trunc("week", ForecastRecord.made_on).label("week")
    weekly = [
        {"week": w.date().isoformat(), "checked": n, "hit_rate": _rate(h or 0, n)}
        for w, n, h in checked.with_entities(week, func.count(ForecastRecord.id), hits_expr).group_by("week").order_by("week")
    ]

    by_category = {
        (cat or "other"): {"checked": n, "hits": h or 0, "hit_rate": _rate(h or 0, n)}
        for cat, n, h in checked.join(Trend, Trend.id == ForecastRecord.trend_id)
        .with_entities(Trend.category, func.count(ForecastRecord.id), hits_expr).group_by(Trend.category)
    }

    pending = db.query(func.count(ForecastRecord.id)).filter(
        ForecastRecord.source == source, ForecastRecord.outcome.is_(None)).scalar() or 0
    next_due = db.query(func.min(ForecastRecord.due_on)).filter(
        ForecastRecord.source == source, ForecastRecord.outcome.is_(None)).scalar()
    return {
        "checked": total,
        "hits": hits,
        "hit_rate": _rate(hits, total),
        "projection_mae": round(mae, 1) if mae is not None else None,
        "naive_mae": round(naive, 1) if naive is not None else None,
        "by_label": by_label,
        "by_confidence": {name: by_conf.get(name, {"checked": 0, "hits": 0, "hit_rate": None}) for name, _, _ in CONFIDENCE_BANDS},
        "by_category": dict(sorted(by_category.items(), key=lambda kv: -kv[1]["checked"])),
        "weekly": weekly,
        "pending": pending,
        "next_check_on": next_due.isoformat() if next_due else None,
    }


def track_record_report(db: Session, open_limit: int = 30) -> dict:
    """The public track record: the accuracy report, plus every live prediction still on record and waiting for
    its check (soonest first), so anyone can see what was called before the outcome is known."""
    report = accuracy_report(db, recent=30)
    live = db.query(ForecastRecord).filter(ForecastRecord.source == "live")
    total, trends, first, latest = live.with_entities(
        func.count(ForecastRecord.id), func.count(func.distinct(ForecastRecord.trend_id)),
        func.min(ForecastRecord.made_on), func.max(ForecastRecord.made_on),
    ).one()
    rows = (
        db.query(ForecastRecord, Trend.name, Trend.slug, Trend.category)
        .join(Trend, Trend.id == ForecastRecord.trend_id)
        .filter(ForecastRecord.source == "live", ForecastRecord.outcome.is_(None))
        .order_by(ForecastRecord.due_on, ForecastRecord.confidence.desc(), ForecastRecord.start_score.desc())
        .limit(open_limit).all()
    )
    next_due = report["live"]["next_check_on"]
    due_next = live.filter(ForecastRecord.outcome.is_(None), ForecastRecord.due_on == date.fromisoformat(next_due)).count() if next_due else 0
    report["on_record"] = {
        "predictions": total or 0, "trends": trends or 0, "due_next": due_next,
        "since": first.isoformat() if first else None, "latest": latest.isoformat() if latest else None,
    }
    report["open"] = [
        {
            "trend": name, "slug": slug, "category": category, "label": r.label,
            "made_on": r.made_on.isoformat(), "due_on": r.due_on.isoformat(),
            "start_score": round(r.start_score, 1), "projected_score": round(r.projected_score, 1), "confidence": r.confidence,
        }
        for r, name, slug, category in rows
    ]
    return report


def accuracy_report(db: Session, recent: int = 12) -> dict:
    live, backtest = _summary(db, "live"), _summary(db, "backtest")
    source = "live" if live["checked"] else "backtest"
    rows = (
        db.query(ForecastRecord, Trend.name, Trend.slug)
        .join(Trend, Trend.id == ForecastRecord.trend_id)
        .filter(ForecastRecord.source == source, ForecastRecord.outcome.in_(("hit", "miss")))
        .order_by(ForecastRecord.resolved_on.desc(), ForecastRecord.confidence.desc())
        .limit(recent).all()
    )
    return {
        "horizon_days": HORIZON_DAYS,
        "rules": HIT_RULES,
        "live": live,
        "backtest": backtest,
        "recent_source": source,
        "recent": [
            {
                "trend": name, "slug": slug, "label": r.label, "made_on": r.made_on.isoformat(),
                "start_score": round(r.start_score, 1), "projected_score": round(r.projected_score, 1),
                "actual_score": round(r.actual_score, 1), "confidence": r.confidence, "hit": r.hit,
            }
            for r, name, slug in rows
        ],
    }
