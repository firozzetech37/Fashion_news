from urllib.parse import quote

from pydantic_settings import BaseSettings


def encode_db_password(url: str) -> str:
    """URL-encode the password in a postgres URL so characters like '@' or '#' don't break parsing.

    Already-encoded passwords (containing '%') are left untouched.
    """
    scheme, sep, rest = url.partition("://")
    if not sep or "@" not in rest:
        return url
    credentials, _, host = rest.rpartition("@")
    user, has_password, password = credentials.partition(":")
    if not has_password or "%" in password:
        return url
    return f"{scheme}://{user}:{quote(password, safe='')}@{host}"


class Settings(BaseSettings):
    PROJECT_NAME: str = "TrendScope API"
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/postgres" # Default/Placeholder
    REDIS_URL: str = "redis://localhost:6379/0"
    GEMINI_API_KEY: str = ""

    # Comma-separated list of origins allowed to call the API
    CORS_ORIGINS: str = "http://localhost:3000"
    # How often Celery beat collects all active sources
    COLLECT_INTERVAL_MINUTES: int = 15

    # Comma-separated emails allowed to use admin actions (signed in through Supabase)
    ADMIN_EMAILS: str = ""
    NEWS_SEARCH_DAYS: int = 7               # how far back a section news search looks
    TOPIC_INTERVAL_MINUTES: int = 15        # how often tracked topics are re-fetched
    # Proxies in front of the API that append to X-Forwarded-For (Render: 1). 0 = use the direct
    # connection address and ignore the header, so a client can't fake its IP to dodge rate limits.
    TRUSTED_PROXY_HOPS: int = 0
    PUBLIC_FETCHES_PER_HOUR: int = 3        # per visitor (non-admin)
    PUBLIC_FETCHES_PER_DAY: int = 50        # all visitors together; admins are not limited
    PUBLIC_REFETCH_HOURS: int = 6           # a name fetched this recently is served from saved stories

    # AI pipeline
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"
    GEMINI_EMBEDDING_MODEL: str = "gemini-embedding-001"
    EMBEDDING_DIM: int = 768
    AI_INTERVAL_MINUTES: int = 2      # how often beat tops up the AI queue (cheap: backpressure skips when full)
    AI_BATCH_SIZE: int = 100          # max articles in flight; must finish well within 15 min at AI_RATE_LIMIT
    AI_RATE_LIMIT: str = "30/m"       # Celery rate limit for Gemini calls, per worker
    AI_MAX_ATTEMPTS: int = 3          # failed articles are retried up to this many times
    DUPLICATE_MAX_DISTANCE: float = 0.08  # cosine distance under which two articles are the same story
    DUPLICATE_WINDOW_DAYS: int = 7

    # Trend engine
    TREND_MERGE_MAX_DISTANCE: float = 0.03  # trend names closer than this are merged (tuned on real data)
    TREND_MIN_CONFIDENCE: float = 0.5       # ignore weaker AI trend extractions
    TREND_MIN_RELEVANCE: float = 0.4        # ignore trends from articles that are barely about fashion
    TREND_WINDOW_DAYS: int = 7              # "current" window; growth compares it with the window before
    TREND_INTERVAL_MINUTES: int = 60        # how often scores are recalculated
    ASSISTANT_MODEL: str = "gemini-3.5-flash"   # user-facing answers: worth the stronger model
    ASSISTANT_THINKING: str = "low"            # low | medium | high
    ASSISTANT_RATE_PER_MINUTE: int = 6         # per visitor IP
    TREND_EXPLAIN_TOP_N: int = 40           # AI explanations kept fresh hourly for the top N; others on first view

    class Config:
        env_file = ".env"
        extra = "allow"

    @property
    def database_url(self) -> str:
        return encode_db_password(self.DATABASE_URL)

    @property
    def admin_emails(self) -> set[str]:
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
