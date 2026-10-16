from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.dialects.postgresql import array
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models import Article, Entity, Source
from app.schemas.article import ArticleOut
from app.schemas.entity import EntityDetail, EntityList

JSON_KEY = {"celebrity": "celebrities", "brand": "brands"}


def _list(db: Session, kind: str, vertical: Optional[str], q: Optional[str], include_all: bool, skip: int, limit: int):
    query = db.query(Entity).filter(Entity.kind == kind)
    if not include_all:
        query = query.filter(Entity.influence_score > 0)  # only those with fashion coverage
    if vertical:
        query = query.filter(Entity.vertical == vertical)
    if q:
        query = query.filter(Entity.name.ilike(f"%{q.strip()}%"))
    total = query.count()
    items = query.order_by(Entity.influence_score.desc(), Entity.stories_total.desc()).offset(skip).limit(limit).all()
    return {"items": items, "total": total}


def _detail(db: Session, kind: str, slug: str) -> EntityDetail:
    entity = db.query(Entity).filter(Entity.kind == kind, Entity.slug == slug).first()
    if not entity:
        raise HTTPException(status_code=404, detail=f"{kind.title()} not found")
    rows = (
        db.query(Article, Source.name)
        .join(Source, Source.id == Article.source_id)
        .filter(
            Article.status == "processed", Article.duplicate_of_id.is_(None),
            Article.entities[JSON_KEY[kind]].has_any(array(entity.aliases or [entity.name])),
        )
        .order_by(Article.published_at.desc().nulls_last())
        .limit(40)
        .all()
    )
    articles = [ArticleOut.model_validate(a).model_copy(update={"source_name": n}) for a, n in rows]
    looks = [
        a for a in articles
        if a.image_url and (a.fashion_relevance or 0) >= settings.TREND_MIN_RELEVANCE
    ][:8]
    return EntityDetail.model_validate(entity).model_copy(update={"articles": articles[:15], "looks": looks})


def make_router(kind: str) -> APIRouter:
    router = APIRouter()

    @router.get("/", response_model=EntityList)
    def list_entities(
        db: Session = Depends(get_db),
        vertical: Optional[str] = Query(None, pattern="^(fashion|bollywood|hollywood)$"),
        q: Optional[str] = None,
        include_all: bool = Query(False, description="Include names with no fashion coverage"),
        skip: int = Query(0, ge=0),
        limit: int = Query(24, ge=1, le=100),
    ):
        return _list(db, kind, vertical, q, include_all, skip, limit)

    @router.get("/{slug}", response_model=EntityDetail)
    def get_entity(slug: str, db: Session = Depends(get_db)):
        return _detail(db, kind, slug)

    return router


celebrities_router = make_router("celebrity")
brands_router = make_router("brand")
