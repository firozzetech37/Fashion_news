from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.core.database import Base


class TrackedTopic(Base):
    """A name or phrase searched for in a section (e.g. "Deepika Padukone" in Bollywood).

    Searching once fetches recent news about it; when `active`, the scheduler keeps fetching it.
    """
    __tablename__ = "tracked_topics"
    __table_args__ = (UniqueConstraint("query_key", "vertical", name="uq_tracked_topics_query_vertical"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    query = Column(String, nullable=False)       # as typed, for display
    query_key = Column(String, nullable=False)   # lowercase, single-spaced
    vertical = Column(String, nullable=False)    # fashion | bollywood | hollywood | runway
    region = Column(String, nullable=False, default="US")  # news edition: IN for Bollywood, else US
    active = Column(Boolean, nullable=False, default=False)  # True = re-fetched on the schedule
    created_by = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_fetched_at = Column(DateTime(timezone=True))
    last_status = Column(String)                 # ok | empty | error
    last_error = Column(Text)
    last_new_articles = Column(Integer, default=0)
    total_articles = Column(Integer, nullable=False, default=0, server_default="0")


class FetchLog(Base):
    """One row per news fetch, used to enforce public limits (kept in the DB so they survive restarts)."""
    __tablename__ = "fetch_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    topic_id = Column(Integer, ForeignKey("tracked_topics.id", ondelete="SET NULL"), index=True)
    query = Column(String, nullable=False)
    is_admin = Column(Boolean, nullable=False, default=False)
    visitor = Column(String, index=True)       # sha256 of the visitor's IP (never the raw address)
    new_articles = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
