from app.core.database import SessionLocal
from app.services.trend_service import run_trend_engine
from workers.celery_app import celery_app


@celery_app.task(name="trends.recalculate")
def recalculate_trends_task():
    db = SessionLocal()
    try:
        return run_trend_engine(db)
    finally:
        db.close()
