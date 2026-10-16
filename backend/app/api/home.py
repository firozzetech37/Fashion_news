from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Article, Source, Trend
from app.schemas.article import ArticleOut
from app.services.trend_query_service import summaries, top_celebrities

router = APIRouter()


@router.get("/")
def homepage(db: Session = Depends(get_db)):
    """Everything the homepage needs in one call."""
    active = db.query(Trend).filter(Trend.trend_score > 0, Trend.status != "declining")
    top = active.order_by(Trend.trend_score.desc()).limit(8).all()
    emerging = (
        db.query(Trend).filter(Trend.status.in_(["emerging", "rising"]), Trend.trend_score > 0)
        .order_by(Trend.momentum_score.desc(), Trend.trend_score.desc()).limit(5).all()
    )
    latest = (
        db.query(Article, Source.name).join(Source, Source.id == Article.source_id)
        .filter(
            Article.status == "processed", Article.duplicate_of_id.is_(None),
            Article.fashion_relevance >= 0.6, Article.image_url.isnot(None),
        )
        .order_by(Article.published_at.desc().nulls_last()).limit(6).all()
    )
    radar = summaries(db, top)
    return {
        "trending": radar[:4],
        "radar": radar,
        "emerging": summaries(db, emerging),
        "celebrities": top_celebrities(db),
        "latest": [ArticleOut.model_validate(a).model_copy(update={"source_name": n}) for a, n in latest],
        "stats": {
            "trends": db.query(func.count(Trend.id)).filter(Trend.trend_score > 0).scalar(),
            "articles": db.query(func.count(Article.id)).filter(Article.status == "processed").scalar(),
            "sources": db.query(func.count(Source.id)).filter(Source.active.is_(True)).scalar(),
        },
    }
