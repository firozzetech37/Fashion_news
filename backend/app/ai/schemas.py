"""Structured output of the article AI. Passed to Gemini as the response schema, so the model must return exactly this."""
from typing import Literal

from pydantic import BaseModel, Field

Category = Literal[
    "fashion", "celebrity", "bollywood", "hollywood", "runway", "designer", "brand", "streetwear",
    "luxury", "beauty", "accessories", "footwear", "jewelry", "wedding", "bridal", "menswear",
    "womenswear", "sustainable", "other",
]
TrendType = Literal[
    "color", "fabric", "pattern", "print", "silhouette", "clothing", "accessory", "footwear",
    "jewelry", "makeup", "hair", "styling", "aesthetic", "brand", "other",
]
Direction = Literal["emerging", "rising", "stable", "declining"]
Sentiment = Literal["positive", "neutral", "negative"]


class Entities(BaseModel):
    people: list[str] = Field(description="Named people who are not celebrities (e.g. stylists, executives)")
    celebrities: list[str] = Field(description="Actors, musicians, influencers and other public figures")
    brands: list[str]
    designers: list[str]
    products: list[str] = Field(description="Specific named products or collections")
    events: list[str] = Field(description="e.g. Met Gala, Cannes, Paris Fashion Week")
    locations: list[str]


class FashionElements(BaseModel):
    colors: list[str]
    fabrics: list[str]
    patterns: list[str]
    silhouettes: list[str]
    clothing: list[str]
    accessories: list[str]
    footwear: list[str]
    jewelry: list[str]
    beauty: list[str] = Field(description="Makeup, hair and beauty looks")
    aesthetic: list[str] = Field(description="e.g. quiet luxury, Y2K, boho")


class ExtractedTrend(BaseModel):
    name: str = Field(description="Short, reusable trend name in Title Case, e.g. 'Chocolate Brown', 'Sheer Fabrics'")
    type: TrendType
    category: Category
    direction: Direction
    confidence: float = Field(description="0 to 1")
    evidence: str = Field(description="What in the input supports this trend, in one sentence")


class Signals(BaseModel):
    """Strength of evidence in this article for each signal, 0 (none) to 1 (strong)."""
    celebrity_adoption: float
    brand_adoption: float
    designer_adoption: float
    runway_adoption: float
    social_signal: float
    media_signal: float


class ArticleSignals(BaseModel):
    language: str = Field(description="ISO 639-1 code of the input text, e.g. 'en', 'hi'")
    category: Category = Field(description="Most relevant primary category")
    secondary_categories: list[Category]
    fashion_relevance: float = Field(
        description="0 to 1. How much this content is about fashion, style or beauty. "
                    "Box office, casting or plot news with no styling content is near 0."
    )
    entities: Entities
    fashion_elements: FashionElements
    trends: list[ExtractedTrend] = Field(description="Empty if the content has no real fashion trend")
    signals: Signals
    summary: str = Field(description="Original 1-2 sentence summary. Do not copy the source text.")
    trend_explanation: str = Field(description="Why the extracted trends may matter, based only on the input. Empty if no trends.")
    sentiment: Sentiment
    semantic_summary: str = Field(description="One concise sentence capturing the core story, used to detect other articles about the same story")
    confidence: float = Field(description="0 to 1, overall confidence in this analysis")


Stage = Literal["emerging", "rising", "trending", "peak", "declining"]


class TrendAnalysis(BaseModel):
    """Output of the trend engine prompt: a narrative on top of the algorithmic score."""
    stage: Stage
    momentum: float = Field(description="0 to 100")
    confidence: float = Field(description="0 to 1. Low when there are few mentions or sources.")
    why_trending: str = Field(description="2-3 sentences for the 'Why is this trending?' panel, citing the numbers given")
    drivers: list[str] = Field(description="Main reasons for the trend, each grounded in the evidence")
    risks: list[str] = Field(description="What could slow it down or why the signal may be weak")
    short_term_outlook: str
    long_term_outlook: str


Industry = Literal[
    "film", "television", "music", "sports", "modeling", "fashion_design", "royalty", "business",
    "influencer", "politics", "other", "unknown",
]


class CelebrityProfile(BaseModel):
    name: str = Field(description="Exactly as given in the input")
    country: str = Field(description="ISO 3166-1 alpha-2 country the person is primarily associated with, e.g. 'IN', 'US', 'GB'. 'unknown' if not sure.")
    industry: Industry
    known_for: str = Field(description="Under 8 words, e.g. 'Bollywood actress', 'Pop singer'. Empty if unknown.")


class CelebrityProfiles(BaseModel):
    profiles: list[CelebrityProfile]


class HighlightedTrend(BaseModel):
    ref: str = Field(description="The trend's reference id from the context, e.g. 'T3'")
    reason: str = Field(description="One short sentence on why it answers the question")


class AssistantAnswer(BaseModel):
    answer: str = Field(description=(
        "The answer in plain text. Short paragraphs; use '- ' bullet lines for lists. "
        "Refer to evidence by numbers from the context (stories, sources, scores), not by reference ids."
    ))
    highlighted_trends: list[HighlightedTrend] = Field(description="Up to 6 trends from the context that best answer the question, most relevant first")
    cited_articles: list[str] = Field(description="Reference ids (e.g. 'A2') of up to 6 articles that support the answer")
    confidence: Literal["low", "medium", "high"] = Field(description="Low when the context only weakly covers the question")
    follow_up_questions: list[str] = Field(description="2-3 short follow-up questions the user could ask next")


class SpellingFix(BaseModel):
    corrected: str = Field(description="The query with the person, brand or fashion term spelled correctly. Unchanged if already correct or unknown.")
