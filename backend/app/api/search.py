from functools import lru_cache

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session

from app.ai.embeddings import embed_text
from app.core.database import get_db
from app.models import Article, Entity, Source, Trend
from app.schemas.article import ArticleOut
from app.schemas.entity import EntitySummary
from app.services.trend_query_service import summaries
from app.services.verticals import vertical_clause
from app.services.spelling_service import suggest_spelling

router = APIRouter()

# Cosine distance cut-offs for semantic matches (tuned on real queries: good matches sit below these, noise just above)
TREND_MAX_DISTANCE = 0.14
ARTICLE_MAX_DISTANCE = 0.18


@lru_cache(maxsize=512)
def _query_vector(q: str) -> tuple[float, ...] | None:
    try:
        return tuple(embed_text(q))
    except Exception:
        return None  # rate limited / offline: fall back to keyword search only


def _merge(primary: list, secondary: list, key, limit: int) -> list:
    seen, out = set(), []
    for item in primary + secondary:
        k = key(item)
        if k not in seen:
            seen.add(k)
            out.append(item)
    return out[:limit]


@router.get("/")
def search(
    q: str = Query(..., min_length=2, max_length=200),
    vertical: Optional[str] = Query(None, pattern="^(fashion|bollywood|hollywood|runway)$"),
    db: Session = Depends(get_db),
):
    """Keyword + semantic search across trends, celebrities, brands and articles, optionally within one section."""
    q = q.strip()
    like = f"%{q}%"
    vector = _query_vector(q.lower())

    trends_kw = (
        db.query(Trend)
        .filter(Trend.trend_score > 0, or_(Trend.name.ilike(like), cast(Trend.aliases, String).ilike(like)))
        .order_by(Trend.trend_score.desc()).limit(8).all()
    )
    trends_sem = []
    if vector:
        distance = Trend.embedding.cosine_distance(list(vector))
        trends_sem = [
            t for t, d in db.query(Trend, distance).filter(Trend.trend_score > 0, Trend.embedding.isnot(None))
            .order_by(distance).limit(8) if d <= TREND_MAX_DISTANCE
        ]
    trends = _merge(trends_kw, trends_sem, lambda t: t.id, 8)

    def entities(kind):
        query = db.query(Entity).filter(Entity.kind == kind, Entity.name.ilike(like))
        if vertical in ("bollywood", "hollywood") and kind == "celebrity":
            query = query.filter(Entity.vertical == vertical)
        return (
            query
            .order_by(Entity.influence_score.desc(), Entity.stories_total.desc()).limit(6).all()
        )

    article_query = (
        db.query(Article, Source.name).join(Source, Source.id == Article.source_id)
        .filter(Article.status == "processed", Article.duplicate_of_id.is_(None))
    )
    if vertical:
        article_query = article_query.filter(vertical_clause(vertical))
    articles_kw = (
        article_query.filter(or_(Article.title.ilike(like), Article.ai_summary.ilike(like)))
        .order_by(Article.published_at.desc().nulls_last()).limit(10).all()
    )
    articles_sem = []
    if vector:
        distance = Article.embedding.cosine_distance(list(vector))
        articles_sem = [
            (a, n) for a, n, d in article_query.add_columns(distance).filter(Article.embedding.isnot(None))
            .order_by(distance).limit(10) if d <= ARTICLE_MAX_DISTANCE
        ]
    articles = _merge(articles_kw, articles_sem, lambda r: r[0].id, 12)

    celebrities, brands = entities("celebrity"), entities("brand")
    nothing = not (trends or celebrities or brands or articles)
    return {
        "query": q,
        "did_you_mean": suggest_spelling(db, q) if nothing else None,
        "semantic": vector is not None,
        "trends": summaries(db, trends),
        "celebrities": [EntitySummary.model_validate(e) for e in celebrities],
        "brands": [EntitySummary.model_validate(e) for e in brands],
        "articles": [ArticleOut.model_validate(a).model_copy(update={"source_name": n}) for a, n in articles],
    }
