from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict

from app.schemas.article import ArticleOut


class TrendSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    type: Optional[str] = None
    category: Optional[str] = None
    trend_score: float
    momentum_score: float
    growth_pct: Optional[float] = None
    status: Optional[str] = None
    confidence: Optional[float] = None
    stats: Optional[dict[str, Any]] = None
    first_detected: Optional[datetime] = None
    last_detected: Optional[datetime] = None
    sparkline: list[int] = []  # daily mention counts, oldest first
    forecast: Optional[dict[str, Any]] = None


class TimelinePoint(BaseModel):
    date: date
    mentions: int


class ScorePoint(BaseModel):
    date: date
    trend_score: float
    momentum_score: float
    status: Optional[str] = None


class NamedCount(BaseModel):
    name: str
    count: int


class RelatedTrend(BaseModel):
    name: str
    slug: str
    status: Optional[str] = None
    trend_score: float
    shared_articles: int = 0


class TrendDetail(TrendSummary):
    aliases: list[str] = []
    score_breakdown: Optional[dict[str, Optional[float]]] = None
    explanation: Optional[dict[str, Any]] = None
    explanation_updated_at: Optional[datetime] = None
    explanation_pending: bool = False
    timeline: list[TimelinePoint] = []
    score_history: list[ScorePoint] = []
    celebrities: list[NamedCount] = []
    brands: list[NamedCount] = []
    sources: list[NamedCount] = []
    related: list[RelatedTrend] = []
    articles: list[ArticleOut] = []


class TrendList(BaseModel):
    items: list[TrendSummary]
    total: int
