from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

SourceCategory = Literal[
    "fashion", "bollywood", "hollywood", "celebrity", "streetwear",
    "luxury", "beauty", "footwear", "menswear", "other",
]
CollectionMethod = Literal["rss"]


def _check_http(value: Optional[str]) -> Optional[str]:
    if value is None:
        return value
    value = value.strip()
    if not value.startswith(("http://", "https://")):
        raise ValueError("must start with http:// or https://")
    return value


class SourceBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    url: str
    feed_url: str
    type: Optional[str] = "publisher"
    category: SourceCategory = "fashion"
    country: Optional[str] = None
    language: str = "en"
    collection_method: CollectionMethod = "rss"
    active: bool = True

    _validate_urls = field_validator("url", "feed_url")(_check_http)


class SourceCreate(SourceBase):
    pass


class SourceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    url: Optional[str] = None
    feed_url: Optional[str] = None
    type: Optional[str] = None
    category: Optional[SourceCategory] = None
    country: Optional[str] = None
    language: Optional[str] = None
    collection_method: Optional[CollectionMethod] = None
    active: Optional[bool] = None

    _validate_urls = field_validator("url", "feed_url")(_check_http)


class SourceOut(SourceBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    category: Optional[str] = None
    collection_method: Optional[str] = None
    created_at: Optional[datetime] = None
    last_collected_at: Optional[datetime] = None
    last_status: Optional[str] = None
    last_error: Optional[str] = None
    last_new_articles: Optional[int] = None
    consecutive_failures: int = 0
    article_count: int = 0


class FeedTestRequest(BaseModel):
    feed_url: str

    _validate_urls = field_validator("feed_url")(_check_http)


class FeedPreviewItem(BaseModel):
    title: str
    url: str
    published_at: Optional[datetime] = None
    image_url: Optional[str] = None


class FeedTestResult(BaseModel):
    ok: bool
    feed_title: Optional[str] = None
    entry_count: int = 0
    error: Optional[str] = None
    sample: list[FeedPreviewItem] = []


class CollectResult(BaseModel):
    source_id: str
    status: str
    new_articles: int = 0
    skipped_duplicates: int = 0
    error: Optional[str] = None
