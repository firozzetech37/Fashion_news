import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.ai.client import AIError, AIRateLimited
from app.core.config import settings
from app.core.net import client_ip
from app.core.database import get_db
from app.services.assistant_service import ask

router = APIRouter()

# Each question costs a model call, so cap it per visitor. In-process: fine for one API instance.
_recent: dict[str, deque] = defaultdict(deque)


def _rate_limit(request: Request):
    ip = client_ip(request)
    now, window = time.monotonic(), _recent[ip]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= settings.ASSISTANT_RATE_PER_MINUTE:
        raise HTTPException(status_code=429, detail="You're asking quickly — please wait a minute and try again.")
    window.append(now)


class AskRequest(BaseModel):
    question: str = Field(min_length=3, max_length=300)


@router.post("/")
def ask_trendscope(payload: AskRequest, request: Request, db: Session = Depends(get_db)):
    _rate_limit(request)
    try:
        return ask(db, payload.question.strip())
    except AIRateLimited:
        raise HTTPException(status_code=503, detail="The assistant is busy right now. Please try again in a moment.")
    except AIError:
        raise HTTPException(status_code=502, detail="The assistant couldn't produce an answer. Please rephrase and try again.")
