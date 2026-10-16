"""In-app alerts, derived from daily trend snapshots (so they can be rebuilt for past days too).

  stage_up      a trend moved up its lifecycle into rising, trending or peak
  new_emerging  a newly detected trend that starts with a strong score
  breakout      the forecast says it's breaking out (at most once a week per trend)
"""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import Alert, Trend, TrendSnapshot

STAGE_RANK = {"declining": 0, "emerging": 1, "rising": 2, "trending": 3, "peak": 4}
LABEL = {"emerging": "Emerging", "rising": "Rising", "trending": "Trending", "peak": "Peak", "declining": "Declining"}
NEW_TREND_MIN_SCORE = 60


def generate_alerts(db: Session, days: int = 14) -> int:
    today = datetime.now(timezone.utc).date()
    since = today - timedelta(days=days)
    names = {tid: (name, stats) for tid, name, stats in db.query(Trend.id, Trend.name, Trend.stats)}

    snaps = defaultdict(list)
    for s in (
        db.query(TrendSnapshot.trend_id, TrendSnapshot.date, TrendSnapshot.status, TrendSnapshot.trend_score)
        .filter(TrendSnapshot.date >= since - timedelta(days=1)).order_by(TrendSnapshot.date)
    ):
        snaps[s.trend_id].append(s)

    first_seen = dict(
        db.query(TrendSnapshot.trend_id, TrendSnapshot.date).distinct(TrendSnapshot.trend_id)
        .order_by(TrendSnapshot.trend_id, TrendSnapshot.date).all()
    )

    rows = []
    for tid, history in snaps.items():
        name = names.get(tid, ("Trend", None))[0]
        for prev, cur in zip(history, history[1:]):
            if cur.date < since or cur.status not in ("rising", "trending", "peak"):
                continue
            if STAGE_RANK.get(cur.status, 0) > STAGE_RANK.get(prev.status, 0):
                rows.append({
                    "trend_id": tid, "kind": "stage_up", "date": cur.date,
                    "title": f"{name} moved up to {LABEL[cur.status]}",
                    "message": f"Was {LABEL.get(prev.status, prev.status)} ({round(prev.trend_score)}), now {LABEL[cur.status]} with a score of {round(cur.trend_score)}.",
                    "from_status": prev.status, "to_status": cur.status, "score": cur.trend_score,
                })
        first = history[0]
        if first_seen.get(tid) == first.date and first.date >= since and first.trend_score >= NEW_TREND_MIN_SCORE:
            rows.append({
                "trend_id": tid, "kind": "new_emerging", "date": first.date,
                "title": f"New trend spotted: {name}",
                "message": f"First detected with a strong score of {round(first.trend_score)}.",
                "from_status": None, "to_status": first.status, "score": first.trend_score,
            })

    # Breakouts from the forecast, at most once a week per trend
    recent_breakouts = {
        tid for (tid,) in db.query(Alert.trend_id).filter(Alert.kind == "breakout", Alert.date > today - timedelta(days=7))
    }
    for t in db.query(Trend).filter(Trend.forecast["label"].astext == "breaking_out"):
        if t.id in recent_breakouts:
            continue
        f = t.forecast
        rows.append({
            "trend_id": t.id, "kind": "breakout", "date": today,
            "title": f"{t.name} is breaking out",
            "message": f"Score {round(t.trend_score)}, climbing about {f['slope_per_day']:+.1f} points a day; projected {round(f['projected_score_7d'])} next week.",
            "from_status": None, "to_status": t.status, "score": t.trend_score,
        })

    if not rows:
        return 0
    before = db.query(Alert.id).count()
    db.execute(insert(Alert).values(rows).on_conflict_do_nothing(constraint="uq_alerts_trend_kind_date"))
    db.commit()
    return db.query(Alert.id).count() - before
