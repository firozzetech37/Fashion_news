from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, alerts, analytics, ask, forecast, topics, articles, home, search, sources, trends, verticals
from app.api.entities import brands_router, celebrities_router
from app.core.auth import require_admin
from app.core.config import settings

app = FastAPI(title="TrendScope API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Admin-only: sources management and pipeline controls (signed-in Supabase user listed in ADMIN_EMAILS)
admin_only = [Depends(require_admin)]
app.include_router(sources.router, prefix="/api/sources", tags=["sources"], dependencies=admin_only)
app.include_router(articles.router, prefix="/api/articles", tags=["articles"])
app.include_router(trends.router, prefix="/api/trends", tags=["trends"])
app.include_router(home.router, prefix="/api/home", tags=["home"])
app.include_router(celebrities_router, prefix="/api/celebrities", tags=["celebrities"])
app.include_router(brands_router, prefix="/api/brands", tags=["brands"])
app.include_router(verticals.router, prefix="/api/verticals", tags=["verticals"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["alerts"])
app.include_router(forecast.router, prefix="/api/forecast", tags=["forecast"])
app.include_router(ask.router, prefix="/api/ask", tags=["assistant"])
app.include_router(topics.router, prefix="/api/topics", tags=["topics"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"], dependencies=admin_only)

@app.get("/")
def read_root():
    return {"status": "TrendScope API is running"}
