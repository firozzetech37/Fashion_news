"""V1 forecasting: simple statistics on each trend's daily score history, no ML yet.

Labels
  breaking_out    rising fast (score slope >= 2/day over the last week)
  likely_to_peak  already trending, but the climb has stalled or slowed sharply
  sustained       trending/peak and holding steady
  steady          active, not moving much either way
  declining       score falling (slope <= -2/day) or the lifecycle stage is declining
  too_early       fewer than 4 days of history or fewer than 2 stories: not enough to call

The projection is the current score plus a damped extension of the last week's slope, capped at
±15 points a week (scores are percentile ranks, so a one-day jump must not project to the ceiling).
Confidence grows with history length, story count and how well a straight line fits.
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import Trend, TrendSnapshot

MIN_DAYS = 4
MIN_STORIES = 2
DAMPING = 0.6          # don't extrapolate a week of slope at full strength
MAX_WEEKLY_CHANGE = 15 # scores are percentile ranks: a one-day jump must not project to the ceiling
CEILING = 99
FAST = 2.0             # score points per day that counts as fast movement


def _fit(points: list[tuple[int, float]]) -> tuple[float, float]:
    """Least-squares slope and r² for (day_index, score) points."""
    n = len(points)
    if n < 2:
        return 0.0, 0.0
    mx = sum(x for x, _ in points) / n
    my = sum(y for _, y in points) / n
    sxx = sum((x - mx) ** 2 for x, _ in points)
    if sxx == 0:
        return 0.0, 0.0
    slope = sum((x - mx) * (y - my) for x, y in points) / sxx
    ss_tot = sum((y - my) ** 2 for _, y in points)
    ss_res = sum((y - (my + slope * (x - mx))) ** 2 for x, y in points)
    return slope, (1 - ss_res / ss_tot) if ss_tot else 1.0


def forecast_trend(score: float, status: str | None, stories_30d: int, history: list[tuple[int, float]]) -> dict:
    """history: (days_ago_negative, score) oldest first, e.g. [(-13, 40.1), ..., (0, 76.0)]."""
    recent = [(x, y) for x, y in history if x > -7]
    earlier = [(x, y) for x, y in history if -14 < x <= -7]
    slope, r2 = _fit(recent)
    prev_slope, _ = _fit(earlier) if len(earlier) >= 3 else (None, None)
    change = max(-MAX_WEEKLY_CHANGE, min(MAX_WEEKLY_CHANGE, slope * 7 * DAMPING))
    projected = round(max(0.0, min(CEILING, score + change)), 1)

    if len(history) < MIN_DAYS or stories_30d < MIN_STORIES:
        label = "too_early"
    elif status == "declining" or slope <= -FAST:
        label = "declining"
    elif status in ("trending", "peak") and (slope <= 0.5 or (prev_slope is not None and prev_slope > 0 and slope < prev_slope * 0.5)):
        label = "likely_to_peak"
    elif slope >= FAST and status in ("emerging", "rising", "trending"):
        label = "breaking_out"
    elif status in ("trending", "peak"):
        label = "sustained"
    else:
        label = "steady"

    confidence = round(
        min(0.9, max(r2, 0.0) * min(1.0, len(history) / 10)) * min(1.0, stories_30d / 5), 2
    ) if label != "too_early" else 0.0
    return {
        "label": label,
        "projected_score_7d": projected,
        "slope_per_day": round(slope, 2),
        "previous_slope_per_day": round(prev_slope, 2) if prev_slope is not None else None,
        "history_days": len(history),
        "confidence": confidence,
    }


def update_forecasts(db: Session) -> dict:
    today = datetime.now(timezone.utc).date()
    since = today - timedelta(days=13)
    history = defaultdict(list)
    for trend_id, day, score in (
        db.query(TrendSnapshot.trend_id, TrendSnapshot.date, TrendSnapshot.trend_score)
        .filter(TrendSnapshot.date >= since).order_by(TrendSnapshot.date)
    ):
        history[trend_id].append(((day - today).days, score))

    rows, made, counts = [], [], defaultdict(int)
    for trend_id, score, status, stats in db.query(Trend.id, Trend.trend_score, Trend.status, Trend.stats):
        if not score:
            rows.append({"id": trend_id, "forecast": None})
            continue
        f = forecast_trend(score, status, (stats or {}).get("mentions_30d", 0), history.get(trend_id, []))
        f["computed_at"] = datetime.now(timezone.utc).isoformat()
        rows.append({"id": trend_id, "forecast": f})
        made.append({"trend_id": trend_id, "score": score, "status": status, "forecast": f})
        counts[f["label"]] += 1
    if rows:
        db.execute(update(Trend), rows)
    db.commit()

    # Save today's forecasts and check the ones made a week ago (app/services/forecast_accuracy_service.py)
    from app.services.forecast_accuracy_service import track
    try:
        accuracy = track(db, today, made)
        db.commit()
    except Exception as exc:  # accuracy tracking must never break the forecasts themselves
        db.rollback()
        accuracy = {"error": f"{type(exc).__name__}: {exc}"[:300]}
    return {**counts, "accuracy": accuracy}
