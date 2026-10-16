"""Admin authentication: the frontend sends the user's Supabase access token; we ask Supabase who
it belongs to and check the email against ADMIN_EMAILS."""
import time

import httpx
from fastapi import Header, HTTPException

from app.core.config import settings

_CACHE_SECONDS = 300
_cache: dict[str, tuple[float, dict | None]] = {}


def _user_for_token(token: str) -> dict | None:
    hit = _cache.get(token)
    if hit and time.monotonic() - hit[0] < _CACHE_SECONDS:
        return hit[1]
    user = None
    try:
        r = httpx.get(
            f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/user",
            headers={"apikey": settings.SUPABASE_KEY, "Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if r.status_code == 200:
            user = r.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Couldn't verify your sign-in right now. Try again.")
    if len(_cache) > 1000:
        _cache.clear()
    _cache[token] = (time.monotonic(), user)
    return user


def current_user(authorization: str | None = Header(default=None)) -> dict | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return _user_for_token(authorization.split(" ", 1)[1].strip())


def require_admin(authorization: str | None = Header(default=None)) -> dict:
    user = current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in as an admin to do this.")
    email = (user.get("email") or "").lower()
    if email not in settings.admin_emails:
        raise HTTPException(status_code=403, detail=f"{email} isn't an admin. Add it to ADMIN_EMAILS in backend/.env.")
    return user
