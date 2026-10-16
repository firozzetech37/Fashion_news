from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.article import ArticleOut


class EntitySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    name: str
    slug: str
    vertical: Optional[str] = None
    country: Optional[str] = None
    industry: Optional[str] = None
    known_for: Optional[str] = None
    image_url: Optional[str] = None
    image_headline: Optional[str] = None
    stories_total: int
    stories_30d: int
    fashion_stories_30d: int
    influence_score: float
    top_trends: list[dict[str, Any]] = []
    last_seen: Optional[datetime] = None


class EntityDetail(EntitySummary):
    aliases: list[str] = []
    related: list[dict[str, Any]] = []
    articles: list[ArticleOut] = []
    looks: list[ArticleOut] = []  # fashion-relevant stories with images


class EntityList(BaseModel):
    items: list[EntitySummary]
    total: int
