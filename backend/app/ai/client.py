from functools import lru_cache

from google import genai
from google.genai import errors

from app.core.config import settings


class AIError(Exception):
    """The model call failed or returned unusable output; counts as a failed attempt."""


class AIRateLimited(Exception):
    """Gemini returned 429 / quota exceeded; retry later without counting an attempt."""


@lru_cache
def get_client() -> genai.Client:
    if not settings.GEMINI_API_KEY:
        raise AIError("GEMINI_API_KEY is not set")
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def reset_client():
    get_client.cache_clear()


def raise_for_transport_error(exc: Exception):
    """The SDK's HTTP client can end up closed (seen under threaded workers); rebuild it and retry later."""
    if isinstance(exc, RuntimeError) and "client has been closed" in str(exc):
        reset_client()
        raise AIRateLimited("Gemini client was closed; retrying with a new client") from exc
    raise exc


def raise_for_api_error(exc: errors.APIError):
    if exc.code == 429 or (exc.code and exc.code >= 500):
        raise AIRateLimited(f"Gemini {exc.code}: {exc.message}") from exc
    raise AIError(f"Gemini {exc.code}: {exc.message}") from exc
