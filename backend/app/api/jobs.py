"""Scheduled jobs without a Celery worker (free hosting).

An external scheduler (GitHub Actions) calls POST /api/jobs/run with the JOBS_TOKEN secret. The work runs
in the API process after the response is sent:

  tick    collect RSS -> fetch tracked topics -> AI-process pending articles -> Google search interest for a few
          trends -> trend engine if due
  collect / topics / ai / search / trends   one step on its own (handy for manual runs)

Locally you can keep using the Celery worker instead; both call the same services.
"""
import hmac
import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from sqlalchemy import func

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import Trend

router = APIRouter()
log = logging.getLogger("trendscope.jobs")

Job = Literal["tick", "collect", "topics", "ai", "search", "trends"]
_lock = threading.Lock()                 # one job at a time per API process
_status: dict = {"running": None, "last": None}


def _clean(value: str | None) -> str:
    """Tokens are pasted by hand into Render and GitHub, so ignore stray whitespace and wrapping quotes."""
    return (value or "").strip().strip("'\"").strip()


def _check_token(token: str | None):
    expected = _clean(settings.JOBS_TOKEN)
    if not expected:
        raise HTTPException(status_code=503, detail="Scheduled jobs are disabled (JOBS_TOKEN is not set).")
    sent = _clean(token)
    if not sent or not hmac.compare_digest(sent.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Invalid jobs token.")


def _step(name: str, fn, results: dict):
    started = time.monotonic()
    db = SessionLocal()
    try:
        results[name] = {"ok": True, "result": fn(db)}
    except Exception as exc:  # one failing step must not stop the rest of the tick
        db.rollback()
        log.exception("job step %s failed", name)
        results[name] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"[:300]}
    finally:
        db.close()
        results[name]["seconds"] = round(time.monotonic() - started, 1)


def _trends_due(db) -> bool:
    last = db.query(func.max(Trend.scored_at)).scalar()
    return last is None or datetime.now(timezone.utc) - last >= timedelta(minutes=settings.TREND_ENGINE_EVERY_MINUTES)


def _run(job: str):
    from app.services.ai_pipeline_service import process_batch
    from app.services.collector_service import collect_all_active
    from app.services.news_search_service import fetch_active_topics
    from app.services.search_interest_service import refresh_search_interest
    from app.services.trend_service import run_trend_engine

    if not _lock.acquire(blocking=False):
        return
    results: dict = {}
    _status["running"] = {"job": job, "started_at": datetime.now(timezone.utc).isoformat()}
    try:
        if job in ("tick", "collect"):
            _step("collect", lambda db: {"sources": len(r := collect_all_active(db)),
                                         "new_articles": sum(x["new_articles"] for x in r)}, results)
        if job in ("tick", "topics"):
            _step("topics", fetch_active_topics, results)
        if job in ("tick", "ai"):
            _step("ai", lambda db: process_batch(db, settings.AI_BATCH_PER_TICK), results)
        if job in ("tick", "search"):
            _step("search", refresh_search_interest, results)
        if job == "trends" or (job == "tick" and _with_db(_trends_due)):
            _step("trends", run_trend_engine, results)
    finally:
        _status["last"] = {**_status["running"], "finished_at": datetime.now(timezone.utc).isoformat(), "results": results}
        _status["running"] = None
        _lock.release()
        log.info("job %s finished: %s", job, results)


def _with_db(fn):
    db = SessionLocal()
    try:
        return fn(db)
    finally:
        db.close()


@router.post("/run", status_code=202)
def run_job(background_tasks: BackgroundTasks, job: Job = "tick", x_jobs_token: str | None = Header(default=None)):
    _check_token(x_jobs_token)
    if _lock.locked():
        return {"status": "already_running", "running": _status["running"]}
    background_tasks.add_task(_run, job)
    return {"status": "started", "job": job}


@router.get("/status")
def job_status(x_jobs_token: str | None = Header(default=None)):
    _check_token(x_jobs_token)
    return _status
