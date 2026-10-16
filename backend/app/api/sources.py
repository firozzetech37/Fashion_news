from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, get_db
from app.models import Article, Source
from app.schemas.source import (
    CollectResult, FeedTestRequest, FeedTestResult, SourceCreate, SourceOut, SourceUpdate,
)
from app.services.collector_service import collect_all_active, collect_source, preview_feed

router = APIRouter()


def _with_count(db: Session, source: Source) -> SourceOut:
    count = db.query(func.count(Article.id)).filter(Article.source_id == source.id).scalar() or 0
    return SourceOut.model_validate(source).model_copy(update={"article_count": count})


def _get_or_404(db: Session, source_id: str) -> Source:
    source = db.get(Source, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return source


def _commit_or_conflict(db: Session):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A source with this feed URL already exists")


@router.get("/", response_model=list[SourceOut])
def list_sources(db: Session = Depends(get_db)):
    counts = dict(db.query(Article.source_id, func.count(Article.id)).group_by(Article.source_id).all())
    sources = db.query(Source).filter(Source.collection_method == "rss").order_by(Source.category, Source.name).all()
    return [
        SourceOut.model_validate(s).model_copy(update={"article_count": counts.get(s.id, 0)})
        for s in sources
    ]


@router.post("/", response_model=SourceOut, status_code=201)
def create_source(payload: SourceCreate, db: Session = Depends(get_db)):
    source = Source(**payload.model_dump())
    db.add(source)
    _commit_or_conflict(db)
    db.refresh(source)
    return _with_count(db, source)


@router.post("/test", response_model=FeedTestResult)
def test_feed(payload: FeedTestRequest):
    """Fetch a feed and show a preview without saving anything."""
    return preview_feed(payload.feed_url)


def _collect_all_in_background():
    db = SessionLocal()
    try:
        collect_all_active(db)
    finally:
        db.close()


@router.post("/collect-all", status_code=202)
def collect_all(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Collect every active source now (runs in the API process, no Celery worker needed)."""
    active = db.query(func.count(Source.id)).filter(Source.active.is_(True)).scalar()
    background_tasks.add_task(_collect_all_in_background)
    return {"queued": active}


@router.get("/{source_id}", response_model=SourceOut)
def get_source(source_id: str, db: Session = Depends(get_db)):
    return _with_count(db, _get_or_404(db, source_id))


@router.patch("/{source_id}", response_model=SourceOut)
def update_source(source_id: str, payload: SourceUpdate, db: Session = Depends(get_db)):
    source = _get_or_404(db, source_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(source, field, value)
    _commit_or_conflict(db)
    db.refresh(source)
    return _with_count(db, source)


@router.delete("/{source_id}", status_code=204)
def delete_source(source_id: str, db: Session = Depends(get_db)):
    db.delete(_get_or_404(db, source_id))
    db.commit()
    return Response(status_code=204)


@router.post("/{source_id}/collect", response_model=CollectResult)
def collect_now(source_id: str, db: Session = Depends(get_db)):
    """Collect a single source immediately and return the result."""
    return collect_source(db, _get_or_404(db, source_id))
