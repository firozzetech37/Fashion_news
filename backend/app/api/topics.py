import hashlib
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.core.auth import current_user, require_admin
from app.core.config import settings
from app.core.net import client_ip
from app.core.database import SessionLocal, get_db
from app.models import Article, FetchLog, Source, TrackedTopic
from app.schemas.article import ArticleOut
from app.services.ai_pipeline_service import process_article
from app.services.news_search_service import default_region, fetch_topic, query_key
from app.services.spelling_service import suggest_spelling

router = APIRouter()

Vertical = Literal["fashion", "bollywood", "hollywood", "runway"]


class TopicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    query: str
    vertical: str
    region: str
    active: bool
    last_fetched_at: Optional[datetime] = None
    last_status: Optional[str] = None
    last_error: Optional[str] = None
    last_new_articles: Optional[int] = None
    total_articles: int = 0


class FetchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=80)
    vertical: Vertical
    track: bool = False


class TopicUpdate(BaseModel):
    active: bool


@router.get("/me")
def me(user: dict | None = Depends(current_user)):
    """Who is signed in, and are they an admin (the frontend uses this to show admin controls)."""
    if not user:
        return {"signed_in": False, "is_admin": False}
    email = (user.get("email") or "").lower()
    return {"signed_in": True, "email": email, "is_admin": email in settings.admin_emails}


@router.get("/", response_model=list[TopicOut])
def list_topics(db: Session = Depends(get_db), vertical: Optional[Vertical] = None):
    query = db.query(TrackedTopic)
    if vertical:
        query = query.filter(TrackedTopic.vertical == vertical)
    return query.order_by(TrackedTopic.active.desc(), TrackedTopic.last_fetched_at.desc().nulls_last()).all()


def _process_in_background(article_ids: list[str]):
    """Run the AI pipeline on freshly fetched stories right away instead of waiting for the queue."""
    from app.ai.client import AIRateLimited

    db = SessionLocal()
    try:
        for article_id in article_ids:
            article = db.get(Article, article_id)
            if not article or article.status != "pending":
                continue
            article.status = "processing"
            db.commit()
            try:
                process_article(db, article_id)
            except AIRateLimited:
                db.rollback()
                db.query(Article).filter(Article.id.in_(article_ids), Article.status == "processing").update(
                    {"status": "pending"}, synchronize_session=False)
                db.commit()
                return  # the scheduled AI queue picks up the rest
    finally:
        db.close()


def _visitor_id(request: Request) -> str:
    """A one-way hash of the visitor's IP (peppered with a server secret), so limits work without storing IPs."""
    ip = client_ip(request)
    return hashlib.sha256(f"{settings.SUPABASE_KEY[:16]}:{ip}".encode()).hexdigest()


def _is_admin(user: dict | None) -> bool:
    return bool(user) and (user.get("email") or "").lower() in settings.admin_emails


def _recent_topic(db: Session, query_text: str, vertical: str) -> TrackedTopic | None:
    """A topic fetched within PUBLIC_REFETCH_HOURS: visitors get its saved stories instead of a new fetch."""
    since = datetime.now(timezone.utc) - timedelta(hours=settings.PUBLIC_REFETCH_HOURS)
    return (
        db.query(TrackedTopic)
        .filter(TrackedTopic.query_key == query_key(query_text), TrackedTopic.vertical == vertical,
                TrackedTopic.last_fetched_at >= since, TrackedTopic.total_articles > 0)
        .first()
    )


def _saved_response(db: Session, topic: TrackedTopic) -> dict:
    rows = (
        db.query(Article, Source.name).join(Source, Source.id == Article.source_id)
        .filter(Article.topic_id == topic.id, Article.duplicate_of_id.is_(None))
        .order_by(Article.published_at.desc().nulls_last()).limit(12).all()
    )
    return {
        "topic": TopicOut.model_validate(topic), "found": topic.total_articles, "new_articles": 0,
        "skipped_duplicates": 0, "cached": True,
        "articles": [ArticleOut.model_validate(a).model_copy(update={"source_name": n}) for a, n in rows],
    }


def _enforce_public_limits(db: Session, visitor: str):
    now = datetime.now(timezone.utc)
    recent = db.query(FetchLog.created_at).filter(
        FetchLog.visitor == visitor, FetchLog.is_admin.is_(False), FetchLog.created_at >= now - timedelta(hours=1)
    ).order_by(FetchLog.created_at).all()
    if len(recent) >= settings.PUBLIC_FETCHES_PER_HOUR:
        wait = max(1, int((recent[0].created_at + timedelta(hours=1) - now).total_seconds() // 60) + 1)
        raise HTTPException(status_code=429, detail=(
            f"You can fetch news {settings.PUBLIC_FETCHES_PER_HOUR} times an hour. Try again in about {wait} minutes; "
            "searching saved stories still works."))
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    used = db.query(FetchLog.id).filter(FetchLog.is_admin.is_(False), FetchLog.created_at >= today).count()
    if used >= settings.PUBLIC_FETCHES_PER_DAY:
        raise HTTPException(status_code=429, detail=(
            "Today's limit for fetching new news has been reached. Saved stories are still searchable; try again tomorrow."))


@router.post("/fetch")
def fetch_news(
    payload: FetchRequest, request: Request, background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), user: dict | None = Depends(current_user),
):
    """Fetch the latest news about a name into a section.

    Everyone can fetch; visitors are limited (per hour, per day, and recently fetched names are served
    from saved stories) because every new story costs AI processing. Admins are unlimited and can track.
    News feeds don't fix typos, so if nothing is found we retry once with a corrected spelling.
    """
    admin = _is_admin(user)
    visitor = _visitor_id(request)
    track = payload.track and admin
    if not admin:
        saved = _recent_topic(db, payload.query, payload.vertical)
        if saved:
            return _saved_response(db, saved)
        _enforce_public_limits(db, visitor)

    creator = (user or {}).get("email") if admin else "public"
    result = _fetch(payload.query, payload.vertical, track, creator, background_tasks, db)
    if result["found"] == 0:
        corrected = suggest_spelling(db, payload.query)
        if corrected:
            if not admin and (saved := _recent_topic(db, corrected, payload.vertical)):
                return {**_saved_response(db, saved), "corrected_from": payload.query}
            retry = _fetch(corrected, payload.vertical, track, creator, background_tasks, db)
            if retry["found"]:
                # the misspelled topic found nothing and isn't worth keeping around
                db.query(TrackedTopic).filter(TrackedTopic.id == result["topic"].id, TrackedTopic.total_articles == 0).delete()
                db.commit()
                result = {**retry, "corrected_from": payload.query}
            else:
                result = {**result, "suggestion": corrected}

    db.add(FetchLog(topic_id=result["topic"].id if db.get(TrackedTopic, result["topic"].id) else None,
                    query=payload.query[:80], is_admin=admin, visitor=visitor, new_articles=result["new_articles"]))
    db.commit()
    return {**result, "cached": False, "tracking_ignored": payload.track and not admin}


def _fetch(query_text: str, vertical: str, track: bool, creator: str | None, background_tasks: BackgroundTasks, db: Session) -> dict:
    key = query_key(query_text)
    topic = db.query(TrackedTopic).filter(TrackedTopic.query_key == key, TrackedTopic.vertical == vertical).first()
    if not topic:
        topic = TrackedTopic(
            query=" ".join(query_text.split()), query_key=key, vertical=vertical,
            region=default_region(vertical), active=track, created_by=creator,
        )
        db.add(topic)
        db.commit()
    elif track and not topic.active:
        topic.active = True
        db.commit()

    result = fetch_topic(db, topic)
    if result["errors"] and not result["found"]:
        raise HTTPException(status_code=502, detail="News search is unavailable right now: " + "; ".join(result["errors"]))
    if result["new_article_ids"]:
        background_tasks.add_task(_process_in_background, result["new_article_ids"])

    rows = (
        db.query(Article, Source.name).join(Source, Source.id == Article.source_id)
        .filter(Article.id.in_(result["new_article_ids"] or [""]))
        .order_by(Article.published_at.desc().nulls_last()).all()
    )
    return {
        "topic": TopicOut.model_validate(topic),
        "found": result["found"],
        "new_articles": len(result["new_article_ids"]),
        "skipped_duplicates": result["skipped_duplicates"],
        "articles": [ArticleOut.model_validate(a).model_copy(update={"source_name": n}) for a, n in rows],
    }


@router.patch("/{topic_id}", response_model=TopicOut)
def update_topic(topic_id: int, payload: TopicUpdate, db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    topic = db.get(TrackedTopic, topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    topic.active = payload.active
    db.commit()
    return topic


@router.delete("/{topic_id}", status_code=204)
def delete_topic(topic_id: int, db: Session = Depends(get_db), _: dict = Depends(require_admin)):
    """Stop tracking and forget the topic. Stories already fetched stay in TrendScope."""
    topic = db.get(TrackedTopic, topic_id)
    if topic:
        db.delete(topic)
        db.commit()
