from workers.celery_app import celery_app
from app.core.database import SessionLocal
from app.models import Source
from app.services.collector_service import collect_source


@celery_app.task(name="collectors.collect_source")
def collect_source_task(source_id: str):
    db = SessionLocal()
    try:
        source = db.get(Source, source_id)
        if not source:
            return {"source_id": source_id, "status": "error", "error": "Source not found"}
        return collect_source(db, source)
    finally:
        db.close()


@celery_app.task(name="collectors.collect_all_sources")
def collect_all_sources_task():
    """Fan out one task per active source so a slow feed doesn't block the others."""
    db = SessionLocal()
    try:
        ids = [s.id for s in db.query(Source.id).filter(Source.active.is_(True), Source.collection_method == "rss")]
    finally:
        db.close()
    for source_id in ids:
        collect_source_task.delay(source_id)
    return {"queued": len(ids)}


@celery_app.task(name="collectors.fetch_tracked_topics")
def fetch_tracked_topics_task():
    from app.services.news_search_service import fetch_active_topics

    db = SessionLocal()
    try:
        return fetch_active_topics(db)
    finally:
        db.close()
