from sqlalchemy import Column, DateTime, Float, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.core.database import Base
import uuid


def generate_uuid():
    return str(uuid.uuid4())


class Entity(Base):
    """A celebrity or brand, aggregated from the entities the AI extracts from articles.

    Rebuilt by the trend engine run (app/services/entity_service.py), so it is always derived data.
    """
    __tablename__ = "entities"
    __table_args__ = (UniqueConstraint("kind", "slug", name="uq_entities_kind_slug"),)

    id = Column(String, primary_key=True, default=generate_uuid)
    kind = Column(String, nullable=False, index=True)  # celebrity | brand
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False)
    aliases = Column(JSONB, default=list)   # exact spellings found in articles (used for lookups)
    vertical = Column(String, index=True)   # dominant vertical: fashion | bollywood | hollywood
    image_url = Column(String)              # from their most recent fashion-relevant story
    image_headline = Column(String)
    country = Column(String)
    industry = Column(String)
    known_for = Column(String)

    stories_total = Column(Integer, default=0, nullable=False)
    stories_30d = Column(Integer, default=0, nullable=False)
    fashion_stories_30d = Column(Integer, default=0, nullable=False)
    influence_score = Column(Float, default=0, nullable=False, index=True)  # 0-100 percentile within kind
    top_trends = Column(JSONB, default=list)  # [{name, slug, count}]
    related = Column(JSONB, default=list)     # brands for a celebrity, celebrities for a brand: [{name, slug, count}]

    first_seen = Column(DateTime(timezone=True))
    last_seen = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class EntityProfile(Base):
    """AI-enriched facts about a celebrity (country, industry). Kept across entity rebuilds so each
    name is only classified once."""
    __tablename__ = "entity_profiles"
    __table_args__ = (UniqueConstraint("kind", "key", name="uq_entity_profiles_kind_key"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    kind = Column(String, nullable=False)
    key = Column(String, nullable=False)   # lowercase name
    country = Column(String)               # ISO 3166 alpha-2, or null when unknown
    industry = Column(String)
    known_for = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
