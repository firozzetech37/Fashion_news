from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import deferred
from sqlalchemy.sql import func

from app.core.config import settings
from app.core.database import Base
import uuid


def generate_uuid():
    return str(uuid.uuid4())


class Trend(Base):
    """A canonical trend. Different spellings/synonyms extracted by the AI are merged into one trend."""
    __tablename__ = "trends"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)              # display name: the most common way it is written
    slug = Column(String, nullable=False, unique=True)
    match_key = Column(String, nullable=False, index=True)  # normalized name used for exact matching
    type = Column(String)        # color | fabric | clothing | aesthetic | ...
    category = Column(String)    # fashion | bollywood | beauty | ...
    aliases = Column(JSONB, default=list)  # every name variant merged into this trend
    embedding = deferred(Column(Vector(settings.EMBEDDING_DIM)))  # large; loaded only when accessed

    # Scores (0-100) and stats, recalculated by the trend engine
    trend_score = Column(Float, default=0, nullable=False, index=True)
    momentum_score = Column(Float, default=0, nullable=False)
    growth_pct = Column(Float)   # share-of-voice change vs previous window; null when brand new
    status = Column(String, default="emerging", index=True)  # emerging | rising | trending | peak | declining
    score_breakdown = Column(JSONB)
    stats = Column(JSONB)        # mentions, sources, celebrities, brands... for the "why is this trending" panel
    confidence = Column(Float)

    # AI analysis from the trend engine prompt
    explanation = Column(JSONB)
    explanation_score = Column(Float)  # trend_score at the time the explanation was generated
    explanation_updated_at = Column(DateTime(timezone=True))

    # Statistical forecast (app/services/forecast_service.py): label, projected score, slope, confidence
    forecast = Column(JSONB)

    first_detected = Column(DateTime(timezone=True))
    last_detected = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    scored_at = Column(DateTime(timezone=True))


class TrendMention(Base):
    __tablename__ = "trend_mentions"
    __table_args__ = (UniqueConstraint("trend_id", "article_id", name="uq_trend_mentions_trend_article"),)

    id = Column(String, primary_key=True, default=generate_uuid)
    trend_id = Column(String, ForeignKey("trends.id", ondelete="CASCADE"), nullable=False, index=True)
    article_id = Column(String, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True)
    source_id = Column(String, ForeignKey("sources.id", ondelete="CASCADE"), nullable=False)

    mentioned_name = Column(String, nullable=False)  # name as extracted from this article
    direction = Column(String)
    confidence = Column(Float)
    evidence = Column(Text)
    sentiment = Column(String)
    mentioned_at = Column(DateTime(timezone=True), nullable=False, index=True)  # article publish time
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TrendSnapshot(Base):
    """One row per trend per day, for score history charts."""
    __tablename__ = "trend_snapshots"
    __table_args__ = (UniqueConstraint("trend_id", "date", name="uq_trend_snapshots_trend_date"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    trend_id = Column(String, ForeignKey("trends.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False)
    trend_score = Column(Float, nullable=False)
    momentum_score = Column(Float, nullable=False)
    mentions_7d = Column(Integer, nullable=False)
    status = Column(String)


class TrendSearchInterest(Base):
    """Google Trends search interest for a trend in one market (geo "" = worldwide).

    Values are Google's 0-100 scale, where 100 is the keyword's own peak in the window, so they show the shape
    of interest over time, not absolute search volume. See app/services/search_interest_service.py.
    """
    __tablename__ = "trend_search_interest"
    __table_args__ = (UniqueConstraint("trend_id", "geo", name="uq_trend_search_interest_trend_geo"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    trend_id = Column(String, ForeignKey("trends.id", ondelete="CASCADE"), nullable=False, index=True)
    geo = Column(String, nullable=False, default="")       # "" worldwide, or a country code like US, GB
    keyword = Column(String, nullable=False)               # what was searched (the trend name at fetch time)
    fetched_at = Column(DateTime(timezone=True), nullable=False, index=True)
    series = Column(JSONB)                                 # [["2026-10-01", 54], ...] daily, complete days only
    has_data = Column(Boolean, nullable=False, default=False)  # False: too few searches for Google to report
    recent_avg = Column(Float)                             # mean of the last 28 complete days
    previous_avg = Column(Float)                           # mean of the 28 days before that
    growth_pct = Column(Float)                             # recent vs previous; null when previous is 0
    error = Column(String)                                 # last fetch error, kept for the admin view


class ForecastRecord(Base):
    """A forecast saved when it was made, then checked against what really happened 7 days later.

    source "live" rows are recorded by the hourly engine (the first forecast of each day is kept, so it is a
    real prediction made in advance). source "backtest" rows replay the forecast on stored score history,
    which gives a hit rate straight away but is weaker evidence. See app/services/forecast_accuracy_service.py.
    """
    __tablename__ = "forecast_records"
    __table_args__ = (UniqueConstraint("trend_id", "made_on", "source", name="uq_forecast_records_trend_day_source"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    trend_id = Column(String, ForeignKey("trends.id", ondelete="CASCADE"), nullable=False, index=True)
    source = Column(String, nullable=False, default="live")    # live | backtest
    made_on = Column(Date, nullable=False, index=True)
    due_on = Column(Date, nullable=False, index=True)          # made_on + horizon: when it is checked

    label = Column(String, nullable=False)                     # breaking_out | likely_to_peak | sustained | steady | declining
    start_score = Column(Float, nullable=False)                # trend_score when the forecast was made
    start_status = Column(String)
    projected_score = Column(Float, nullable=False)            # projected_score_7d
    confidence = Column(Float, nullable=False, default=0)

    # Filled in once due_on has passed
    resolved_on = Column(Date)
    actual_score = Column(Float)                               # 0 when the trend dropped out of scoring (faded)
    actual_status = Column(String)
    outcome = Column(String, index=True)                       # hit | miss | no_data (null while pending)
    hit = Column(Boolean)
    projection_error = Column(Float)                           # |projected - actual|
    naive_error = Column(Float)                                # |start - actual|: the "nothing changes" baseline
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Alert(Base):
    """In-app alert about a trend's movement. One per trend, kind and day."""
    __tablename__ = "alerts"
    __table_args__ = (UniqueConstraint("trend_id", "kind", "date", name="uq_alerts_trend_kind_date"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    trend_id = Column(String, ForeignKey("trends.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String, nullable=False)   # stage_up | breakout | new_emerging
    date = Column(Date, nullable=False, index=True)
    title = Column(String, nullable=False)
    message = Column(Text)
    from_status = Column(String)
    to_status = Column(String)
    score = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
