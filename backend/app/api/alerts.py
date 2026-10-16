from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Alert, Trend

router = APIRouter()


@router.get("/")
def list_alerts(db: Session = Depends(get_db), limit: int = Query(30, ge=1, le=100)):
    rows = (
        db.query(Alert, Trend.slug, Trend.status)
        .join(Trend, Trend.id == Alert.trend_id)
        .order_by(Alert.date.desc(), Alert.score.desc())
        .limit(limit).all()
    )
    return [
        {
            "id": a.id, "kind": a.kind, "date": a.date, "title": a.title, "message": a.message,
            "to_status": a.to_status, "score": a.score, "created_at": a.created_at,
            "trend_slug": slug, "trend_status": status,
        }
        for a, slug, status in rows
    ]
