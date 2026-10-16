from app.ai.client import AIRateLimited
from app.core.config import settings
from app.core.database import SessionLocal
from app.services.ai_pipeline_service import claim_batch, in_flight, process_article, release, release_stuck
from workers.celery_app import celery_app


@celery_app.task(name="ai.queue_pending")
def queue_pending_task(limit: int | None = None):
    """Claim the next batch of pending articles and fan out one task per article.

    Backpressure: only tops the queue up to `limit` in-flight articles, so work is never claimed
    faster than the rate limit can process it (which would trip the stuck-article recovery).
    """
    db = SessionLocal()
    try:
        released = release_stuck(db)
        room = (limit or settings.AI_BATCH_SIZE) - in_flight(db)
        ids = claim_batch(db, room) if room > 0 else []
    finally:
        db.close()
    for article_id in ids:
        process_article_task.delay(article_id)
    return {"queued": len(ids), "released_stuck": released}


@celery_app.task(
    name="ai.process_article",
    bind=True,
    rate_limit=settings.AI_RATE_LIMIT,
    max_retries=5,
)
def process_article_task(self, article_id: str):
    db = SessionLocal()
    try:
        return process_article(db, article_id)
    except AIRateLimited as exc:
        if self.request.retries >= self.max_retries:
            release(db, [article_id])  # give it back to the queue for a later run
            return {"article_id": article_id, "status": "released", "error": str(exc)}
        raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))
    finally:
        db.close()
