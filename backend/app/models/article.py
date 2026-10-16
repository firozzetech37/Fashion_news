from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, Float, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import deferred
from sqlalchemy.sql import func
from app.core.config import settings
from app.core.database import Base
import uuid

def generate_uuid():
    return str(uuid.uuid4())

class Article(Base):
    __tablename__ = "articles"

    id = Column(String, primary_key=True, default=generate_uuid)
    source_id = Column(String, ForeignKey("sources.id", ondelete="CASCADE"), nullable=False, index=True)
    
    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    canonical_url = Column(String, unique=True, nullable=False)
    
    author = Column(String)
    published_at = Column(DateTime(timezone=True), index=True)
    collected_at = Column(DateTime(timezone=True), server_default=func.now())
    
    image_url = Column(String)
    raw_description = Column(Text)
    language = Column(String, default="en")
    
    category = Column(String)
    subcategory = Column(String)
    
    status = Column(String, default="pending", index=True)  # pending | processing | processed | failed
    content_hash = Column(String, unique=True)
    ai_processed = Column(Boolean, default=False)

    # AI output (see app/ai/schemas.py)
    secondary_categories = Column(JSONB)
    fashion_relevance = Column(Float)
    entities = Column(JSONB)
    fashion_elements = Column(JSONB)
    ai_trends = Column(JSONB)  # raw extracted trends; normalized into a trends table in Week 4
    signals = Column(JSONB)
    ai_summary = Column(Text)
    trend_explanation = Column(Text)
    sentiment = Column(String)
    semantic_summary = Column(Text)
    ai_confidence = Column(Float)
    embedding = deferred(Column(Vector(settings.EMBEDDING_DIM)))  # large; loaded only when accessed
    duplicate_of_id = Column(String, ForeignKey("articles.id", ondelete="SET NULL"), index=True)

    # AI processing bookkeeping
    ai_model = Column(String)
    ai_attempts = Column(Integer, default=0, nullable=False, server_default="0")
    ai_error = Column(Text)
    ai_started_at = Column(DateTime(timezone=True))
    ai_processed_at = Column(DateTime(timezone=True))
    # Set when the article came from a section news search: keeps it in that section
    vertical_hint = Column(String, index=True)
    topic_id = Column(Integer, ForeignKey("tracked_topics.id", ondelete="SET NULL"), index=True)
    trends_linked_at = Column(DateTime(timezone=True), index=True)  # set once its trends are linked to canonical trends
