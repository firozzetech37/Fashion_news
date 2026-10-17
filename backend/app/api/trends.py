from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db
from app.models import Trend
from app.schemas.trend import SearchInterest, TrendDetail, TrendList, TrendSummary
from app.services.search_interest_service import search_detail
from app.services.trend_query_service import summaries, trend_detail_parts

router = APIRouter()

SORTS = {
    "score": [Trend.trend_score.desc()],
    "momentum": [Trend.momentum_score.desc(), Trend.trend_score.desc()],
    "recent": [Trend.last_detected.desc().nulls_last()],
}


@router.get("/", response_model=TrendList)
def list_trends(
    db: Session = Depends(get_db),
    status: Optional[str] = Query(None, description="Comma-separated, e.g. 'rising,trending'"),
    category: Optional[str] = None,
    type: Optional[str] = None,
    vertical: Optional[str] = Query(None, pattern="^(fashion|bollywood|hollywood|runway)$"),
    q: Optional[str] = Query(None, description="Search trend names and aliases"),
    sort: str = Query("score", pattern="^(score|momentum|recent)$"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    query = db.query(Trend).filter(Trend.trend_score > 0)
    if status:
        query = query.filter(Trend.status.in_(status.split(",")))
    if category:
        query = query.filter(Trend.category == category)
    if vertical:
        from app.api.verticals import trends_in_vertical
        query = query.filter(Trend.id.in_(trends_in_vertical(db, vertical).with_entities(Trend.id)))
    if type:
        query = query.filter(Trend.type == type)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(Trend.name.ilike(like), cast(Trend.aliases, String).ilike(like)))
    total = query.count()
    trends = query.order_by(*SORTS[sort]).offset(skip).limit(limit).all()
    return {"items": summaries(db, trends), "total": total}


@router.get("/trending", response_model=list[TrendSummary])
def trending(db: Session = Depends(get_db), limit: int = Query(10, ge=1, le=50)):
    trends = (
        db.query(Trend).filter(Trend.trend_score > 0, Trend.status != "declining")
        .order_by(Trend.trend_score.desc()).limit(limit).all()
    )
    return summaries(db, trends)


@router.get("/emerging", response_model=list[TrendSummary])
def emerging(db: Session = Depends(get_db), limit: int = Query(10, ge=1, le=50)):
    trends = (
        db.query(Trend).filter(Trend.status.in_(["emerging", "rising"]), Trend.trend_score > 0)
        .order_by(Trend.momentum_score.desc(), Trend.trend_score.desc()).limit(limit).all()
    )
    return summaries(db, trends)


_explaining: set[str] = set()  # trend ids with an explanation being generated in this process


def _explain_in_background(trend_id: str):
    from app.services.trend_service import explain_trend_now

    db = SessionLocal()
    try:
        trend = db.get(Trend, trend_id)
        if trend and trend.explanation is None:
            explain_trend_now(db, trend)
    except Exception:
        db.rollback()  # rate limited or model error: the next view (or hourly run) tries again
    finally:
        _explaining.discard(trend_id)
        db.close()


@router.get("/{slug}", response_model=TrendDetail)
def get_trend(slug: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    trend = db.query(Trend).filter(Trend.slug == slug).first()
    if not trend:
        raise HTTPException(status_code=404, detail="Trend not found")
    # Trends outside the hourly top-N get their AI analysis the first time someone looks at them
    pending = trend.explanation is None and trend.trend_score > 0
    if pending and trend.id not in _explaining:
        _explaining.add(trend.id)
        background_tasks.add_task(_explain_in_background, trend.id)
    detail = TrendDetail.model_validate(trend).model_copy(update=trend_detail_parts(db, trend))
    return detail.model_copy(update={"explanation_pending": pending, "search_interest": _search(db, trend.id)})


def _search(db: Session, trend_id: str) -> SearchInterest | None:
    data = search_detail(db, trend_id)
    return SearchInterest.model_validate(data) if data else None
