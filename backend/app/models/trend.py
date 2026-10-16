from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
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
