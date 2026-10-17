from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "trendscope_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["collectors.rss_collector", "workers.ai_tasks", "workers.trend_tasks"]
)

# Hosted Redis (e.g. Upstash) silently drops idle connections. Without timeouts and health checks
# the worker blocks forever on a dead socket and stops processing while jobs pile up in Redis.
_REDIS_SOCKET_OPTIONS = {
    "socket_timeout": 30,
    "socket_connect_timeout": 10,
    "socket_keepalive": True,
    "health_check_interval": 25,
    "retry_on_timeout": True,
}


def _every(minutes: int, task: str) -> dict:
    # A scheduled run that waits longer than its own interval is stale: drop it rather than
    # replaying a backlog after downtime.
    return {"task": task, "schedule": minutes * 60, "options": {"expires": minutes * 60}}


celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    result_expires=3600,
    # Collection is network-bound, so threads work well; this also avoids prefork issues on macOS
    worker_pool="threads",
    worker_concurrency=8,
    broker_transport_options={**_REDIS_SOCKET_OPTIONS, "visibility_timeout": 3600},
    result_backend_transport_options=_REDIS_SOCKET_OPTIONS,
    redis_socket_timeout=30,
    redis_socket_keepalive=True,
    redis_backend_health_check_interval=25,
    broker_connection_retry_on_startup=True,
    broker_connection_max_retries=None,  # keep reconnecting instead of giving up
    worker_cancel_long_running_tasks_on_connection_loss=True,
    beat_schedule={
        "collect-all-sources": _every(settings.COLLECT_INTERVAL_MINUTES, "collectors.collect_all_sources"),
        "process-ai-queue": _every(settings.AI_INTERVAL_MINUTES, "ai.queue_pending"),
        "recalculate-trends": _every(settings.TREND_INTERVAL_MINUTES, "trends.recalculate"),
        "fetch-tracked-topics": _every(settings.TOPIC_INTERVAL_MINUTES, "collectors.fetch_tracked_topics"),
        "search-interest": _every(30, "trends.search_interest"),
    },
)
