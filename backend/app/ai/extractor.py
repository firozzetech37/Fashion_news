from google.genai import errors, types

from app.ai.client import AIError, get_client, raise_for_api_error, raise_for_transport_error
from app.ai.prompts import ARTICLE_SYSTEM_PROMPT, article_prompt
from app.ai.schemas import ArticleSignals
from app.core.config import settings


def extract_fashion_signals(title: str, description: str, source: str, date: str, category: str = "") -> ArticleSignals:
    """Run the master prompt on one article. Raises AIError or AIRateLimited."""
    try:
        response = get_client().models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=article_prompt(title, description, source, date, category),
            config=types.GenerateContentConfig(
                system_instruction=ARTICLE_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=ArticleSignals,
                temperature=0.2,
            ),
        )
    except errors.APIError as exc:
        raise_for_api_error(exc)
    except RuntimeError as exc:
        raise_for_transport_error(exc)

    if not isinstance(response.parsed, ArticleSignals):
        reason = response.candidates[0].finish_reason if response.candidates else "no candidates"
        raise AIError(f"Model returned no valid JSON (finish reason: {reason})")
    return response.parsed
