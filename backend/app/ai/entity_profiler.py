from google.genai import errors, types

from app.ai.client import AIError, get_client, raise_for_api_error, raise_for_transport_error
from app.ai.schemas import CelebrityProfiles
from app.core.config import settings

PROMPT = """For each name below (public figures mentioned in fashion and entertainment news), give the
country they are primarily associated with, their industry and what they are known for.
Use 'unknown' when you are not confident; never guess. Return one profile per input name.

Names:
"""


def profile_celebrities(names: list[str]) -> CelebrityProfiles:
    try:
        response = get_client().models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=PROMPT + "\n".join(f"- {n}" for n in names),
            config=types.GenerateContentConfig(
                response_mime_type="application/json", response_schema=CelebrityProfiles, temperature=0,
            ),
        )
    except errors.APIError as exc:
        raise_for_api_error(exc)
    except RuntimeError as exc:
        raise_for_transport_error(exc)
    if not isinstance(response.parsed, CelebrityProfiles):
        raise AIError("Celebrity profiling returned no valid JSON")
    return response.parsed
