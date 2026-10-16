from google.genai import errors, types

from app.ai.client import AIError, get_client, raise_for_api_error, raise_for_transport_error
from app.core.config import settings


def embed_texts(texts: list[str], task_type: str = "SEMANTIC_SIMILARITY") -> list[list[float]]:
    """Embed several texts in one call. Raises AIError or AIRateLimited."""
    try:
        response = get_client().models.embed_content(
            model=settings.GEMINI_EMBEDDING_MODEL,
            contents=texts,
            config=types.EmbedContentConfig(task_type=task_type, output_dimensionality=settings.EMBEDDING_DIM),
        )
    except errors.APIError as exc:
        raise_for_api_error(exc)
    except RuntimeError as exc:
        raise_for_transport_error(exc)
    if not response.embeddings or len(response.embeddings) != len(texts):
        raise AIError("Embedding response did not match the number of inputs")
    return [e.values for e in response.embeddings]


def embed_text(text: str, task_type: str = "SEMANTIC_SIMILARITY") -> list[float]:
    return embed_texts([text], task_type)[0]
