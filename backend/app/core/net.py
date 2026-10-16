from fastapi import Request

from app.core.config import settings


def client_ip(request: Request) -> str:
    """The visitor's real IP for rate limiting.

    X-Forwarded-For is client-controlled except for the entries our own proxies append on the right,
    so with N trusted proxies the real client is the Nth entry from the right.
    """
    hops = settings.TRUSTED_PROXY_HOPS
    if hops > 0:
        chain = [ip.strip() for ip in (request.headers.get("x-forwarded-for") or "").split(",") if ip.strip()]
        if len(chain) >= hops:
            return chain[-hops]
    return request.client.host if request.client else "unknown"
