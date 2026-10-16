from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Trend, TrendSnapshot

router = APIRouter()

TYPE_LEADER_TYPES = ["color", "clothing", "fabric", "footwear", "accessory", "aesthetic", "makeup", "jewelry"]


def _point(t: Trend) -> dict:
    return {
        "name": t.name, "slug": t.slug, "type": t.type, "category": t.category, "status": t.status,
        "trend_score": t.trend_score, "momentum_score": t.momentum_score, "growth_pct": t.growth_pct,
        "mentions_30d": (t.stats or {}).get("mentions_30d", 0),
    }


@router.get("/radar")
def radar(
    db: Session = Depends(get_db),
    vertical: Optional[str] = Query(None, pattern="^(fashion|bollywood|hollywood|runway)$"),
    limit: int = Query(60, ge=10, le=150),
):
    """Top active trends with what the radar needs: lifecycle stage (ring), type (sector), score (size)."""
    query = db.query(Trend).filter(Trend.trend_score > 0)
    if vertical:
        from app.api.verticals import trends_in_vertical
        query = query.filter(Trend.id.in_(trends_in_vertical(db, vertical).with_entities(Trend.id)))
    return [_point(t) for t in query.order_by(Trend.trend_score.desc()).limit(limit)]


@router.get("/overview")
def overview(db: Session = Depends(get_db), history_days: int = Query(30, ge=7, le=90)):
    active = db.query(Trend).filter(Trend.trend_score > 0)
    lifecycle = dict(active.with_entities(Trend.status, func.count(Trend.id)).group_by(Trend.status).all())

    # Score history for the current top trends (the "Emerging -> Rising -> Peak" comparison)
    top = active.filter(Trend.status != "declining").order_by(Trend.trend_score.desc()).limit(4).all()
    since = datetime.now(timezone.utc).date() - timedelta(days=history_days)
    snaps = (
        db.query(TrendSnapshot.trend_id, TrendSnapshot.date, TrendSnapshot.trend_score, TrendSnapshot.status)
        .filter(TrendSnapshot.trend_id.in_([t.id for t in top]), TrendSnapshot.date >= since)
        .order_by(TrendSnapshot.date).all()
    )
    by_trend = defaultdict(dict)
    for tid, day, score, status in snaps:
        by_trend[tid][day] = (score, status)
    days = [since + timedelta(days=i) for i in range(history_days + 1)]  # full axis; lines start when a trend appears
    history = [
        {"date": d, **{t.slug: by_trend[t.id].get(d, (None,))[0] for t in top},
         **{f"{t.slug}__status": by_trend[t.id].get(d, (None, None))[1] for t in top}}
        for d in days
    ]

    # Biggest movers: today's score vs one week ago (absent a week ago = 0)
    today = datetime.now(timezone.utc).date()
    week_ago = dict(
        db.query(TrendSnapshot.trend_id, TrendSnapshot.trend_score)
        .filter(TrendSnapshot.date == today - timedelta(days=7)).all()
    )
    deltas = [
        {**_point(t), "change": round(t.trend_score - week_ago.get(t.id, 0.0), 1), "was": week_ago.get(t.id)}
        for t in db.query(Trend).filter((Trend.trend_score > 0) | Trend.id.in_(list(week_ago)))
    ]
    deltas.sort(key=lambda d: d["change"], reverse=True)

    leaders = {}
    for trend_type in TYPE_LEADER_TYPES:
        leaders[trend_type] = [
            _point(t) for t in active.filter(Trend.type == trend_type, Trend.status != "declining")
            .order_by(Trend.trend_score.desc()).limit(5)
        ]

    new_week = active.filter(Trend.first_detected >= datetime.now(timezone.utc) - timedelta(days=7)).count()
    return {
        "lifecycle": {s: lifecycle.get(s, 0) for s in ("emerging", "rising", "trending", "peak", "declining")},
        "active_trends": sum(lifecycle.values()),
        "new_this_week": new_week,
        "history_series": [{"slug": t.slug, "name": t.name, "status": t.status} for t in top],
        "history": history,
        "risers": [d for d in deltas if d["change"] > 0][:8],
        "fallers": [d for d in reversed(deltas) if d["change"] < 0][:8],
        "type_leaders": leaders,
    }
