"""AI processing queue: pending article -> Gemini extraction -> embedding -> duplicate detection -> processed.

Article.status lifecycle:
    pending -> processing -> processed
                          -> failed  (retried until AI_MAX_ATTEMPTS)
"""
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, or_, update
from sqlalchemy.orm import Session

from app.ai.client import AIError, AIRateLimited
from app.ai.embeddings import embed_text
from app.ai.extractor import extract_fashion_signals
from app.ai.schemas import ArticleSignals
from app.core.config import settings
from app.models import Article, Source
from app.services.trend_service import link_article_trends

STUCK_AFTER = timedelta(minutes=15)


def _now():
    return datetime.now(timezone.utc)


def _claimable():
    return or_(
        Article.status == "pending",
        and_(Article.status == "failed", Article.ai_attempts < settings.AI_MAX_ATTEMPTS),
    )


def release_stuck(db: Session) -> int:
    """Put articles back in the queue if a worker died while processing them."""
    result = db.execute(
        update(Article)
        .where(Article.status == "processing", Article.ai_started_at < _now() - STUCK_AFTER)
        .values(status="pending")
    )
    db.commit()
    return result.rowcount


def claim_batch(db: Session, limit: int) -> list[str]:
    """Atomically mark up to `limit` queued articles as processing and return their ids, newest first.

    SKIP LOCKED lets several workers claim batches at the same time without overlap.
    """
    ids = [
        row.id for row in db.query(Article.id)
        .filter(_claimable())
        .order_by(Article.published_at.desc().nulls_last())
        .limit(limit)
        .with_for_update(skip_locked=True)
    ]
    if ids:
        db.execute(
            update(Article).where(Article.id.in_(ids)).values(status="processing", ai_started_at=_now())
        )
    db.commit()
    return ids


def release(db: Session, article_ids: list[str]):
    """Return claimed-but-unprocessed articles to the queue (e.g. after hitting the rate limit)."""
    if article_ids:
        db.execute(
            update(Article)
            .where(Article.id.in_(article_ids), Article.status == "processing")
            .values(status="pending")
        )
        db.commit()


def _embedding_text(article: Article, signals: ArticleSignals) -> str:
    return "\n".join(filter(None, [article.title, signals.semantic_summary, signals.summary]))


def _find_duplicate(db: Session, article: Article, vector: list[float]) -> str | None:
    """Return the id of the original story if a near-identical article was already processed recently."""
    anchor = article.published_at or article.collected_at or _now()
    window = timedelta(days=settings.DUPLICATE_WINDOW_DAYS)
    distance = Article.embedding.cosine_distance(vector)
    match = (
        db.query(Article.id, Article.duplicate_of_id, distance.label("distance"))
        .filter(
            Article.id != article.id,
            Article.embedding.isnot(None),
            func.coalesce(Article.published_at, Article.collected_at).between(anchor - window, anchor + window),
        )
        .order_by(distance)
        .first()
    )
    if match and match.distance <= settings.DUPLICATE_MAX_DISTANCE:
        return match.duplicate_of_id or match.id  # always point at the first article of the story
    return None


def in_flight(db: Session) -> int:
    return db.query(func.count(Article.id)).filter(Article.status == "processing").scalar()


def process_article(db: Session, article_id: str, force: bool = False) -> dict:
    """Run the full AI pipeline on one article and save the result.

    Raises AIRateLimited (article stays 'processing' so the caller can retry or release it).
    Any other failure is recorded on the article and returned, not raised.
    """
    row = (
        db.query(Article, Source.name)
        .join(Source, Source.id == Article.source_id)
        .filter(Article.id == article_id)
        .first()
    )
    if not row:
        return {"article_id": article_id, "status": "missing"}
    article, source_name = row
    if article.status == "processed" and not force:
        return {"article_id": article_id, "status": "skipped"}  # already done by another task

    try:
        signals = extract_fashion_signals(
            title=article.title,
            description=article.raw_description or "",
            source=source_name,
            date=article.published_at.isoformat() if article.published_at else "",
            category=article.category or "",
        )
        vector = embed_text(_embedding_text(article, signals))
    except AIRateLimited:
        raise
    except Exception as exc:  # AIError, validation problems, network errors...
        db.rollback()
        article.status = "failed"
        article.ai_attempts = (article.ai_attempts or 0) + 1
        article.ai_error = (str(exc) if isinstance(exc, AIError) else f"{type(exc).__name__}: {exc}")[:1000]
        db.commit()
        return {"article_id": article_id, "status": "failed", "error": article.ai_error}

    article.language = signals.language or article.language
    article.category = signals.category
    article.subcategory = signals.trends[0].type if signals.trends else None
    article.secondary_categories = signals.secondary_categories
    article.fashion_relevance = signals.fashion_relevance
    article.entities = signals.entities.model_dump()
    article.fashion_elements = signals.fashion_elements.model_dump()
    article.ai_trends = [t.model_dump() for t in signals.trends]
    article.signals = signals.signals.model_dump()
    article.ai_summary = signals.summary
    article.trend_explanation = signals.trend_explanation or None
    article.sentiment = signals.sentiment
    article.semantic_summary = signals.semantic_summary
    article.ai_confidence = signals.confidence
    article.embedding = vector
    article.duplicate_of_id = _find_duplicate(db, article, vector)
    article.ai_model = settings.GEMINI_MODEL
    article.ai_attempts = (article.ai_attempts or 0) + 1
    article.ai_error = None
    article.ai_processed_at = _now()
    article.ai_processed = True
    article.status = "processed"
    article.trends_linked_at = None
    db.commit()

    trends_linked = None
    try:
        trends_linked = link_article_trends(db, article)
    except Exception:
        db.rollback()  # e.g. rate limited while embedding a new trend name; the hourly trend run retries

    return {
        "article_id": article_id,
        "status": "processed",
        "category": signals.category,
        "trends": len(signals.trends),
        "duplicate_of_id": article.duplicate_of_id,
        "trends_linked": trends_linked,
    }


def process_batch(db: Session, limit: int) -> dict:
    """Process up to `limit` articles in this process (used by the admin 'Process now' button).

    On a rate limit it waits once, then gives the rest of the batch back to the queue.
    """
    release_stuck(db)
    ids = claim_batch(db, limit)
    summary = {"claimed": len(ids), "processed": 0, "failed": 0, "rate_limited": False}
    for index, article_id in enumerate(ids):
        for attempt in range(2):
            try:
                result = process_article(db, article_id)
                summary["processed" if result["status"] == "processed" else "failed"] += 1
                break
            except AIRateLimited:
                if attempt == 0:
                    time.sleep(30)
                    continue
                summary["rate_limited"] = True
                release(db, ids[index:])
                return summary
    return summary


def pipeline_stats(db: Session) -> dict:
    by_status = dict(db.query(Article.status, func.count(Article.id)).group_by(Article.status).all())
    since = _now() - timedelta(hours=24)
    processed_24h = db.query(func.count(Article.id)).filter(Article.ai_processed_at >= since).scalar()
    failed_final = db.query(func.count(Article.id)).filter(
        Article.status == "failed", Article.ai_attempts >= settings.AI_MAX_ATTEMPTS
    ).scalar()
    processed = by_status.get("processed", 0)
    failed = by_status.get("failed", 0)
    finished = processed + failed
    return {
        "by_status": {s: by_status.get(s, 0) for s in ("pending", "processing", "processed", "failed")},
        "processed_last_24h": processed_24h,
        "failed_permanently": failed_final,
        "success_rate": round(processed / finished, 3) if finished else None,
        "duplicates": db.query(func.count(Article.id)).filter(Article.duplicate_of_id.isnot(None)).scalar(),
        "with_trends": db.query(func.count(Article.id)).filter(
            Article.ai_trends.isnot(None), func.jsonb_array_length(Article.ai_trends) > 0
        ).scalar(),
        "model": settings.GEMINI_MODEL,
        "embedding_model": settings.GEMINI_EMBEDDING_MODEL,
        "max_attempts": settings.AI_MAX_ATTEMPTS,
    }
