"""Verticals (Fashion, Bollywood, Hollywood, Runway) are views over articles, defined by the AI category
of the article and the category of its source."""
from sqlalchemy import or_, select

from app.models import Article, Source

VERTICALS = {
    "fashion": {
        "article_categories": [
            "fashion", "designer", "brand", "luxury", "accessories", "footwear", "jewelry",
            "menswear", "womenswear", "streetwear", "beauty", "sustainable",
        ],
        "source_categories": ["fashion", "streetwear"],
    },
    "bollywood": {"article_categories": ["bollywood", "wedding", "bridal"], "source_categories": ["bollywood"]},
    "hollywood": {"article_categories": ["hollywood", "celebrity"], "source_categories": ["hollywood", "celebrity"]},
    "runway": {"article_categories": ["runway"], "source_categories": [], "runway_signal": 0.5},
}


def vertical_clause(name: str):
    """SQL condition selecting the articles that belong to a vertical."""
    v = VERTICALS[name]
    conditions = [Article.category.in_(v["article_categories"]), Article.vertical_hint == name]
    if v["source_categories"]:
        conditions.append(Article.source_id.in_(select(Source.id).where(Source.category.in_(v["source_categories"]))))
    if v.get("runway_signal"):
        conditions.append(Article.signals["runway_adoption"].as_float() >= v["runway_signal"])
    return or_(*conditions)


def article_vertical(article_category: str | None, source_category: str | None) -> str:
    """Single dominant vertical for one article (used to label celebrities and brands)."""
    if source_category == "bollywood" or article_category in VERTICALS["bollywood"]["article_categories"]:
        return "bollywood"
    if article_category in VERTICALS["hollywood"]["article_categories"] or source_category in ("hollywood", "celebrity"):
        return "hollywood"
    return "fashion"
