from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Trend
from app.services.forecast_accuracy_service import accuracy_report
from app.services.trend_query_service import summaries

router = APIRouter()

GROUPS = ["breaking_out", "likely_to_peak", "sustained", "steady", "declining"]
PER_GROUP = 12


@router.get("/")
def forecast(db: Session = Depends(get_db)):
    """Trends grouped by forecast label, strongest first (3 queries total)."""
    label = Trend.forecast["label"].astext
    rank = func.row_number().over(partition_by=label, order_by=Trend.trend_score.desc()).label("rank")
    ranked = (
        db.query(Trend.id.label("id"), rank)
        .filter(Trend.trend_score > 0, label.in_(GROUPS))
        .subquery()
    )
    trends = (
        db.query(Trend).join(ranked, ranked.c.id == Trend.id)
        .filter(ranked.c.rank <= PER_GROUP).order_by(Trend.trend_score.desc()).all()
    )
    grouped = defaultdict(list)
    for s in summaries(db, trends):  # one sparkline query for every group
        grouped[s.forecast["label"]].append(s)
    too_early = db.query(func.count(Trend.id)).filter(Trend.trend_score > 0, label == "too_early").scalar()
    return {"groups": {g: grouped.get(g, []) for g in GROUPS}, "too_early": too_early}


@router.get("/accuracy")
def accuracy(db: Session = Depends(get_db)):
    """How often past forecasts came true: live (recorded in advance) and backtest (replayed history), kept separate."""
    return accuracy_report(db)
