from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class ArticleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_id: str
    source_name: Optional[str] = None
    title: str
    url: str
    canonical_url: Optional[str] = None
    author: Optional[str] = None
    published_at: Optional[datetime] = None
    collected_at: Optional[datetime] = None
    image_url: Optional[str] = None
    raw_description: Optional[str] = None
    language: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    status: Optional[str] = None
    ai_processed: bool = False

    # AI output
    secondary_categories: Optional[list[str]] = None
    fashion_relevance: Optional[float] = None
    entities: Optional[dict[str, Any]] = None
    fashion_elements: Optional[dict[str, Any]] = None
    ai_trends: Optional[list[dict[str, Any]]] = None
    signals: Optional[dict[str, Any]] = None
    ai_summary: Optional[str] = None
    trend_explanation: Optional[str] = None
    sentiment: Optional[str] = None
    ai_confidence: Optional[float] = None
    duplicate_of_id: Optional[str] = None
    ai_model: Optional[str] = None
    ai_attempts: int = 0
    ai_error: Optional[str] = None
    ai_processed_at: Optional[datetime] = None


class ArticleList(BaseModel):
    items: list[ArticleOut]
    total: int


class SimilarArticle(BaseModel):
    article: ArticleOut
    distance: float
