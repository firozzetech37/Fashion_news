"""Spelling help for searches: news search feeds don't auto-correct ("shradha kappor" returns nothing),
so we suggest the right spelling ourselves.

1. Known names first: fuzzy-match against celebrities, brands and trends TrendScope already tracks.
2. Otherwise one small AI call to correct a celebrity/brand/fashion-term spelling (cached).
"""
import difflib
from functools import lru_cache

from google.genai import types
from sqlalchemy.orm import Session

from app.ai.client import get_client
from app.ai.schemas import SpellingFix
from app.core.config import settings
from app.models import Entity, Trend

FUZZY_CUTOFF = 0.82


@lru_cache(maxsize=1024)
def _ai_correct(query: str) -> str | None:
    try:
        response = get_client().models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=(
                "Correct the spelling of this search query from a fashion and entertainment news site. "
                "It is usually a celebrity, designer, brand or fashion term (Bollywood and Hollywood). "
                "Return it with correct spelling and capitalisation. If it is already correct or you don't "
                f"recognise it, return it unchanged.\n\nQuery: {query}"
            ),
            config=types.GenerateContentConfig(
                response_mime_type="application/json", response_schema=SpellingFix, temperature=0,
            ),
        )
    except Exception:
        return None  # spelling help is best-effort; never block a search on it
    return response.parsed.corrected.strip() if isinstance(response.parsed, SpellingFix) else None


def suggest_spelling(db: Session, query: str) -> str | None:
    """A better spelling for `query`, or None if it already looks right."""
    q = " ".join(query.split())
    if len(q) < 3:
        return None
    known = [n for (n,) in db.query(Entity.name)] + [n for (n,) in db.query(Trend.name).filter(Trend.trend_score > 0)]
    by_lower = {n.lower(): n for n in known}
    if q.lower() in by_lower:
        return None
    match = difflib.get_close_matches(q.lower(), list(by_lower), n=1, cutoff=FUZZY_CUTOFF)
    if match:
        return by_lower[match[0]]
    corrected = _ai_correct(q.lower())
    if corrected and corrected.lower() != q.lower():
        return corrected
    return None
