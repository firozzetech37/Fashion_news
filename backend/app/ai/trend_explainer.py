from google.genai import errors, types

from app.ai.client import AIError, get_client, raise_for_api_error, raise_for_transport_error
from app.ai.prompts import TREND_SYSTEM_PROMPT, trend_prompt
from app.ai.schemas import TrendAnalysis
from app.core.config import settings


def explain_trend(trend: dict, evidence: list[str]) -> TrendAnalysis:
    """Run the trend engine prompt. Raises AIError or AIRateLimited."""
    try:
        response = get_client().models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=trend_prompt(trend, evidence),
            config=types.GenerateContentConfig(
                system_instruction=TREND_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=TrendAnalysis,
                temperature=0.3,
            ),
        )
    except errors.APIError as exc:
        raise_for_api_error(exc)
    except RuntimeError as exc:
        raise_for_transport_error(exc)

    if not isinstance(response.parsed, TrendAnalysis):
        raise AIError("Trend analysis returned no valid JSON")
    return response.parsed
