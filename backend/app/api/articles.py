from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import require_admin
from app.core.database import get_db
from app.models import Article, Source
from app.schemas.article import ArticleList, ArticleOut, SimilarArticle
from app.services.ai_pipeline_service import process_article
from app.services.verticals import vertical_clause

router = APIRouter()


def _to_out(article: Article, source_name: Optional[str]) -> ArticleOut:
    return ArticleOut.model_validate(article).model_copy(update={"source_name": source_name})


def _get_or_404(db: Session, article_id: str):
    row = (
        db.query(Article, Source.name).join(Source, Source.id == Article.source_id)
        .filter(Article.id == article_id).first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")
    return row


@router.get("/", response_model=ArticleList)
def list_articles(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    source_id: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
    has_trends: bool = False,
    exclude_duplicates: bool = False,
    min_relevance: Optional[float] = Query(None, ge=0, le=1),
    vertical: Optional[str] = Query(None, pattern="^(fashion|bollywood|hollywood|runway)$"),
    has_image: bool = False,
    sort: str = Query("published", pattern="^(published|processed)$"),
):
    query = db.query(Article, Source.name).join(Source, Source.id == Article.source_id)
    if source_id:
        query = query.filter(Article.source_id == source_id)
    if category:
        query = query.filter(Article.category == category)
    if status:
        query = query.filter(Article.status == status)
    if has_trends:
        query = query.filter(Article.ai_trends.isnot(None), func.jsonb_array_length(Article.ai_trends) > 0)
    if exclude_duplicates:
        query = query.filter(Article.duplicate_of_id.is_(None))
    if min_relevance is not None:
        query = query.filter(Article.fashion_relevance >= min_relevance)
    if vertical:
        query = query.filter(vertical_clause(vertical))
    if has_image:
        query = query.filter(Article.image_url.isnot(None), Article.image_url != "")
    total = query.count()
    order = (
        [Article.ai_processed_at.desc().nulls_last()]
        if sort == "processed"
        else [Article.published_at.desc().nulls_last(), Article.collected_at.desc()]
    )
    rows = query.order_by(*order).offset(skip).limit(limit).all()
    return {"items": [_to_out(a, name) for a, name in rows], "total": total}


@router.get("/{article_id}", response_model=ArticleOut)
def get_article(article_id: str, db: Session = Depends(get_db)):
    return _to_out(*_get_or_404(db, article_id))


@router.get("/{article_id}/similar", response_model=list[SimilarArticle])
def similar_articles(article_id: str, limit: int = Query(5, ge=1, le=20), db: Session = Depends(get_db)):
    """Nearest articles by embedding (pgvector cosine distance)."""
    article, _ = _get_or_404(db, article_id)
    if article.embedding is None:
        raise HTTPException(status_code=409, detail="Article has not been processed by the AI pipeline yet")
    distance = Article.embedding.cosine_distance(article.embedding).label("distance")
    rows = (
        db.query(Article, Source.name, distance)
        .join(Source, Source.id == Article.source_id)
        .filter(Article.id != article.id, Article.embedding.isnot(None))
        .order_by(distance)
        .limit(limit)
        .all()
    )
    return [{"article": _to_out(a, name), "distance": round(d, 4)} for a, name, d in rows]


@router.post("/{article_id}/reprocess", response_model=ArticleOut, dependencies=[Depends(require_admin)])
def reprocess_article(article_id: str, db: Session = Depends(get_db)):
    """Run the AI pipeline on this article again right now."""
    from app.ai.client import AIRateLimited

    article, _ = _get_or_404(db, article_id)
    article.status = "processing"
    db.commit()
    try:
        process_article(db, article_id, force=True)
    except AIRateLimited as exc:
        article.status = "pending"
        db.commit()
        raise HTTPException(status_code=429, detail=str(exc))
    return _to_out(*_get_or_404(db, article_id))
