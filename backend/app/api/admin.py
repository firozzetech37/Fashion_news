from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy import func, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal, get_db
from app.models import Article, Source
from app.schemas.article import ArticleOut
from app.services.ai_pipeline_service import pipeline_stats, process_batch
from app.services.trend_service import run_trend_engine

router = APIRouter()


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    status_counts = dict(
        db.query(Source.last_status, func.count(Source.id))
        .filter(Source.active.is_(True), Source.collection_method == "rss").group_by(Source.last_status).all()
    )
    return {
        "sources_total": db.query(func.count(Source.id)).filter(Source.collection_method == "rss").scalar(),
        "sources_active": db.query(func.count(Source.id)).filter(Source.active.is_(True), Source.collection_method == "rss").scalar(),
        "sources_by_status": status_counts,
        "articles_total": db.query(func.count(Article.id)).scalar(),
        "articles_last_24h": db.query(func.count(Article.id)).filter(Article.collected_at >= since).scalar(),
        "articles_pending_ai": db.query(func.count(Article.id)).filter(Article.ai_processed.is_(False)).scalar(),
    }


def _recent(db: Session, *filters, order, limit: int):
    rows = (
        db.query(Article, Source.name).join(Source, Source.id == Article.source_id)
        .filter(*filters).order_by(order).limit(limit).all()
    )
    return [ArticleOut.model_validate(a).model_copy(update={"source_name": n}) for a, n in rows]


@router.get("/ai")
def ai_pipeline(db: Session = Depends(get_db)):
    """AI queue health, recent results and recent failures for the admin dashboard."""
    return {
        **pipeline_stats(db),
        "recent_processed": _recent(
            db, Article.status == "processed", order=Article.ai_processed_at.desc(), limit=12
        ),
        "recent_failures": _recent(
            db, Article.status == "failed", order=Article.ai_started_at.desc().nulls_last(), limit=20
        ),
    }


def _process_in_background(limit: int):
    db = SessionLocal()
    try:
        process_batch(db, limit)
    finally:
        db.close()


@router.post("/ai/process", status_code=202)
def process_now(background_tasks: BackgroundTasks, limit: int = Query(25, ge=1, le=100)):
    """Process the next batch of pending articles in the API process (no Celery worker needed)."""
    background_tasks.add_task(_process_in_background, limit)
    return {"queued": limit}


@router.post("/ai/retry-failed")
def retry_failed(db: Session = Depends(get_db)):
    """Give every failed article a fresh set of attempts."""
    result = db.execute(
        update(Article).where(Article.status == "failed").values(status="pending", ai_attempts=0, ai_error=None)
    )
    db.commit()
    return {"requeued": result.rowcount, "max_attempts": settings.AI_MAX_ATTEMPTS}


def _trend_engine_in_background():
    db = SessionLocal()
    try:
        run_trend_engine(db)
    finally:
        db.close()


@router.post("/trends/recalculate", status_code=202)
def recalculate_trends(background_tasks: BackgroundTasks):
    """Link new articles, rescore all trends and refresh AI explanations (runs hourly via Celery too)."""
    background_tasks.add_task(_trend_engine_in_background)
    return {"status": "started"}
