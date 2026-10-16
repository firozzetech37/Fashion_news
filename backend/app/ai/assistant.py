from google.genai import errors, types

from app.ai.client import AIError, get_client, raise_for_api_error, raise_for_transport_error
from app.ai.prompts import ASSISTANT_SYSTEM_PROMPT, assistant_prompt
from app.ai.schemas import AssistantAnswer
from app.core.config import settings


def answer_question(question: str, context: str, data_window: str) -> AssistantAnswer:
    try:
        response = get_client().models.generate_content(
            model=settings.ASSISTANT_MODEL,
            contents=assistant_prompt(question, context, data_window),
            config=types.GenerateContentConfig(
                system_instruction=ASSISTANT_SYSTEM_PROMPT,
                response_mime_type="application/json",
                response_schema=AssistantAnswer,
                temperature=0.3,
                # Retrieval already did the heavy lifting; light reasoning keeps answers ~2-3x faster
                thinking_config=types.ThinkingConfig(thinking_level=settings.ASSISTANT_THINKING),
            ),
        )
    except errors.APIError as exc:
        raise_for_api_error(exc)
    except RuntimeError as exc:
        raise_for_transport_error(exc)
    if not isinstance(response.parsed, AssistantAnswer):
        raise AIError("The assistant returned no valid answer")
    return response.parsed
