from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import Article, Entity, Source, Trend, TrendMention
from app.schemas.article import ArticleOut
from app.schemas.entity import EntitySummary
from app.services.trend_query_service import summaries
from app.services.verticals import VERTICALS, vertical_clause

router = APIRouter()


def trends_in_vertical(db: Session, vertical: str):
    """Trends with at least one mention from an article in this vertical."""
    in_vertical = (
        db.query(TrendMention.trend_id)
        .join(Article, Article.id == TrendMention.article_id)
        .filter(vertical_clause(vertical))
        .distinct()
    )
    return db.query(Trend).filter(Trend.id.in_(in_vertical))


@router.get("/{vertical}")
def vertical_page(vertical: str, db: Session = Depends(get_db)):
    """Everything a vertical page (Fashion, Bollywood, Hollywood, Runway) needs in one call."""
    if vertical not in VERTICALS:
        raise HTTPException(status_code=404, detail="Unknown vertical")

    base = trends_in_vertical(db, vertical).filter(Trend.trend_score > 0)
    top = base.filter(Trend.status != "declining").order_by(Trend.trend_score.desc()).limit(8).all()
    emerging = (
        base.filter(Trend.status.in_(["emerging", "rising"]))
        .order_by(Trend.momentum_score.desc(), Trend.trend_score.desc()).limit(6).all()
    )

    # People for the celebrity verticals, brands for fashion and runway
    entity_kind = "celebrity" if vertical in ("bollywood", "hollywood") else "brand"
    entities = db.query(Entity).filter(Entity.kind == entity_kind, Entity.influence_score > 0)
    if entity_kind == "celebrity":
        entities = entities.filter(Entity.vertical == vertical)
    entities = entities.order_by(Entity.influence_score.desc()).limit(8).all()

    stories = (
        db.query(Article, Source.name).join(Source, Source.id == Article.source_id)
        .filter(
            vertical_clause(vertical), Article.status == "processed", Article.duplicate_of_id.is_(None),
            Article.fashion_relevance >= 0.5, Article.image_url.isnot(None),
        )
        .order_by(Article.published_at.desc().nulls_last()).limit(9).all()
    )
    story_count = db.query(func.count(Article.id)).filter(vertical_clause(vertical), Article.status == "processed").scalar()

    return {
        "vertical": vertical,
        "trends": summaries(db, top),
        "emerging": summaries(db, emerging),
        "entity_kind": entity_kind,
        "entities": [EntitySummary.model_validate(e) for e in entities],
        "stories": [ArticleOut.model_validate(a).model_copy(update={"source_name": n}) for a, n in stories],
        "stats": {"stories": story_count, "trends": base.count()},
    }
