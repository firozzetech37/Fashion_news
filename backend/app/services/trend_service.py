"""Trend engine: turns per-article AI trend extractions into canonical, scored trends.

1. Linking   - every extracted trend name is matched to a canonical Trend (exact normalized name first,
               then embedding similarity) and recorded as a TrendMention.
2. Scoring   - transparent weighted score (see WEIGHTS), each component normalized 0-100 by percentile
               rank across active trends. Growth uses share of voice, so adding sources doesn't
               make every trend look like it is exploding.
3. Lifecycle - emerging / rising / trending / peak / declining from score and growth.
4. Explain   - the trend engine prompt writes "why is this trending" for the top trends.
"""
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import distinct, func, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai.client import AIError, AIRateLimited
from app.ai.embeddings import embed_texts
from app.ai.trend_explainer import explain_trend
from app.core.config import settings
from app.models import Article, Source, Trend, TrendMention, TrendSnapshot

WEIGHTS = {
    "mention_growth": 0.25,
    "source_diversity": 0.20,
    "celebrity_influence": 0.15,
    "brand_adoption": 0.15,
    "social_signals": 0.10,
    "search_interest": 0.10,  # no search data source yet; excluded and the other weights rescaled
    "fashion_week": 0.05,
}
AVAILABLE_COMPONENTS = [k for k in WEIGHTS if k != "search_interest"]
EXPLANATION_MAX_AGE = timedelta(hours=24)
EXPLANATION_SCORE_CHANGE = 10

# ---------------------------------------------------------------------------
# Name normalization
# ---------------------------------------------------------------------------

_SYNONYMS = {"sari": "saree", "saris": "saree", "colour": "color", "colours": "color", "grey": "gray"}


def _singular(word: str) -> str:
    if len(word) <= 3:
        return word
    if word.endswith(("sses", "shes", "ches", "xes")):
        return word[:-2]
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith("s") and not word.endswith(("ss", "us", "is")):
        return word[:-1]
    return word


def match_key(name: str) -> str:
    """'Kanjeevaram Saris' and 'kanjeevaram sari' -> 'kanjeevaram saree'."""
    text = re.sub(r"[^a-z0-9]+", " ", name.lower().replace("&", " and "))
    return " ".join(_singular(_SYNONYMS.get(w, w)) for w in text.split())


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:80] or "trend"


def _embedding_text(name: str, trend_type: str | None) -> str:
    return f"{name} ({trend_type or 'other'})"


def _now():
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Linking
# ---------------------------------------------------------------------------

def _candidates(article: Article) -> list[dict]:
    """Trend extractions from this article that are strong enough to count."""
    if (article.fashion_relevance or 0) < settings.TREND_MIN_RELEVANCE:
        return []
    seen, out = set(), []
    for t in article.ai_trends or []:
        name = (t.get("name") or "").strip()
        key = match_key(name)
        if not key or key in seen or (t.get("confidence") or 0) < settings.TREND_MIN_CONFIDENCE:
            continue
        seen.add(key)
        out.append({**t, "name": name, "key": key})
    return out


def _unique_slug(db: Session, name: str) -> str:
    base = slugify(name)
    slug, n = base, 2
    while db.query(Trend.id).filter(Trend.slug == slug).first():
        slug, n = f"{base}-{n}", n + 1
    return slug


def _resolve(db: Session, cand: dict, vector: list[float] | None, when: datetime) -> Trend:
    trend = db.query(Trend).filter(Trend.match_key == cand["key"]).first()
    if not trend and vector is not None:
        distance = Trend.embedding.cosine_distance(vector)
        nearest = db.query(Trend, distance.label("d")).filter(Trend.embedding.isnot(None)).order_by(distance).first()
        if nearest and nearest.d <= settings.TREND_MERGE_MAX_DISTANCE:
            trend = nearest.Trend
    if not trend:
        trend = Trend(
            name=cand["name"], slug=_unique_slug(db, cand["name"]), match_key=cand["key"],
            type=cand.get("type"), category=cand.get("category"), aliases=[cand["name"]],
            embedding=vector, first_detected=when, last_detected=when,
        )
        db.add(trend)
        db.flush()  # make it visible to the next lookup in this article
        return trend
    if cand["name"] not in (trend.aliases or []):
        trend.aliases = [*(trend.aliases or []), cand["name"]]
    trend.first_detected = min(filter(None, [trend.first_detected, when]))
    trend.last_detected = max(filter(None, [trend.last_detected, when]))
    return trend


def link_article_trends(db: Session, article: Article, vectors: dict[str, list[float]] | None = None) -> int:
    """Create/refresh this article's trend mentions. Idempotent (safe on reprocess).

    `vectors` optionally pre-supplies embeddings keyed by _embedding_text (used by the backfill).
    Raises AIRateLimited if an embedding is needed and Gemini is rate limited.
    """
    for attempt in range(2):
        try:
            db.query(TrendMention).filter(TrendMention.article_id == article.id).delete()
            cands = _candidates(article)

            # Embed only names that don't match an existing trend exactly
            known = {k for (k,) in db.query(Trend.match_key).filter(Trend.match_key.in_([c["key"] for c in cands]))}
            vectors = dict(vectors or {})
            missing = [
                _embedding_text(c["name"], c.get("type")) for c in cands
                if c["key"] not in known and _embedding_text(c["name"], c.get("type")) not in vectors
            ]
            if missing:
                vectors.update(zip(missing, embed_texts(missing)))

            when = article.published_at or article.collected_at or _now()
            linked = set()
            for cand in cands:
                trend = _resolve(db, cand, vectors.get(_embedding_text(cand["name"], cand.get("type"))), when)
                if trend.id in linked:
                    continue  # two names in one article merged into the same trend
                linked.add(trend.id)
                db.add(TrendMention(
                    trend_id=trend.id, article_id=article.id, source_id=article.source_id,
                    mentioned_name=cand["name"], direction=cand.get("direction"),
                    confidence=cand.get("confidence"), evidence=cand.get("evidence"),
                    sentiment=article.sentiment, mentioned_at=when,
                ))
            article.trends_linked_at = _now()
            db.commit()
            return len(linked)
        except IntegrityError:
            # Another worker created the same trend/slug at the same moment; retry and it will match
            db.rollback()
            if attempt:
                raise
    return 0


def link_unlinked(db: Session, limit: int = 500) -> dict:
    """Link processed articles that have no trend mentions yet (backfill + recovery after rate limits)."""
    articles = (
        db.query(Article)
        .filter(Article.status == "processed", Article.trends_linked_at.is_(None))
        .order_by(Article.published_at)
        .limit(limit)
        .all()
    )
    # Batch-embed every candidate name up front: 100 names per call instead of one call per article
    texts = sorted({_embedding_text(c["name"], c.get("type")) for a in articles for c in _candidates(a)})
    known_keys = {k for (k,) in db.query(Trend.match_key)}
    texts = [t for t in texts if match_key(t.rsplit(" (", 1)[0]) not in known_keys]
    vectors: dict[str, list[float]] = {}
    for i in range(0, len(texts), 100):
        batch = texts[i:i + 100]
        vectors.update(zip(batch, embed_texts(batch)))

    mentions = 0
    for article in articles:
        mentions += link_article_trends(db, article, vectors)
    return {"articles": len(articles), "mentions": mentions}


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _percentiles(raw: dict[str, float]) -> dict[str, float]:
    """Percentile rank 0-100 among non-zero values (ties share the average rank). Zero stays zero."""
    positive = sorted((v, k) for k, v in raw.items() if v > 0)
    out = {k: 0.0 for k in raw}
    i = 0
    while i < len(positive):
        j = i
        while j + 1 < len(positive) and positive[j + 1][0] == positive[i][0]:
            j += 1
        rank = (i + j) / 2 + 1
        for _, k in positive[i:j + 1]:
            out[k] = round(100 * rank / len(positive), 1)
        i = j + 1
    return out


def _status(score: float, cur: int, prev: int, share_cur: float, share_prev: float, mentions_30d: int) -> str:
    if cur == 0:
        return "declining"
    if prev >= 2 and share_cur < 0.7 * share_prev:
        return "declining"
    if score >= 80 and prev >= 2 and share_cur <= 1.2 * share_prev:
        return "peak"
    if score >= 70:
        return "trending"
    if cur >= 2 and (prev == 0 or share_cur > share_prev):
        return "rising"
    return "emerging"


def _story_count(db: Session, start: datetime, end: datetime) -> int:
    """Distinct fashion-relevant stories (duplicates collapsed) published in [start, end)."""
    ts = func.coalesce(Article.published_at, Article.collected_at)
    return db.query(func.count(distinct(func.coalesce(Article.duplicate_of_id, Article.id)))).filter(
        Article.status == "processed",
        Article.fashion_relevance >= settings.TREND_MIN_RELEVANCE,
        ts >= start, ts < end,
    ).scalar() or 0


def _compute_scores(db: Session, now: datetime, end: datetime):
    """Score every trend as of `now`, counting only mentions published before `end`.

    Returns (trend_updates, snapshot_rows, totals). Pure computation: nothing is written.
    """
    window = timedelta(days=settings.TREND_WINDOW_DAYS)
    cur_start, prev_start, start_30d = now - window, now - 2 * window, now - timedelta(days=30)
    total_cur = _story_count(db, cur_start, end)
    total_prev = _story_count(db, prev_start, cur_start)

    rows = (
        db.query(
            TrendMention.trend_id, TrendMention.article_id, TrendMention.source_id, TrendMention.mentioned_name,
            TrendMention.mentioned_at, TrendMention.confidence, Article.duplicate_of_id, Article.entities,
            Article.signals,
        )
        .join(Article, Article.id == TrendMention.article_id)
        .filter(TrendMention.mentioned_at >= min(prev_start, start_30d), TrendMention.mentioned_at < end)
        .all()
    )

    agg = defaultdict(lambda: {
        "cur": set(), "prev": set(), "s30": set(), "sources": set(), "celebs": Counter(), "brands": Counter(),
        "celeb_sig": 0.0, "brand_sig": 0.0, "social": 0.0, "runway": 0.0, "runway_mentions": 0,
        "names": Counter(), "conf": [],
    })
    for r in rows:
        a = agg[r.trend_id]
        story = r.duplicate_of_id or r.article_id
        if r.mentioned_at >= cur_start:
            a["cur"].add(story)
        elif r.mentioned_at >= prev_start:
            a["prev"].add(story)
        if r.mentioned_at < start_30d:
            continue
        a["s30"].add(story)
        a["sources"].add(r.source_id)
        a["names"][r.mentioned_name] += 1
        a["conf"].append(r.confidence or 0)
        ents, sig = r.entities or {}, r.signals or {}
        a["celebs"].update(set(ents.get("celebrities") or []))
        a["brands"].update(set((ents.get("brands") or []) + (ents.get("designers") or [])))
        a["celeb_sig"] += sig.get("celebrity_adoption", 0)
        a["brand_sig"] += sig.get("brand_adoption", 0) + sig.get("designer_adoption", 0)
        a["social"] += sig.get("social_signal", 0)
        a["runway"] += sig.get("runway_adoption", 0)
        a["runway_mentions"] += sig.get("runway_adoption", 0) >= 0.5

    eps = 0.5 / max(total_cur, total_prev, 1)
    raw = {k: {} for k in AVAILABLE_COMPONENTS}
    derived = {}
    for tid, a in agg.items():
        cur, prev = len(a["cur"]), len(a["prev"])
        share_cur = cur / total_cur if total_cur else 0
        share_prev = prev / total_prev if total_prev else 0
        ratio = min(4.0, max(0.25, (share_cur + eps) / (share_prev + eps)))
        raw["mention_growth"][tid] = math.log1p(cur) * ratio
        raw["source_diversity"][tid] = len(a["sources"])
        raw["celebrity_influence"][tid] = len(a["celebs"]) + a["celeb_sig"]
        raw["brand_adoption"][tid] = len(a["brands"]) + a["brand_sig"]
        raw["social_signals"][tid] = a["social"]
        raw["fashion_week"][tid] = a["runway"]
        derived[tid] = {
            "cur": cur, "prev": prev, "share_cur": share_cur, "share_prev": share_prev,
            "growth_pct": round((share_cur / share_prev - 1) * 100, 1) if prev and share_prev else None,
        }

    pct = {k: _percentiles(v) for k, v in raw.items()}
    weight_total = sum(WEIGHTS[k] for k in AVAILABLE_COMPONENTS)
    today = now.date()
    updates, snapshots = [], []

    for trend_id, name in db.query(Trend.id, Trend.name).all():
        a = agg.get(trend_id)
        if not a or not a["s30"]:
            updates.append({
                "id": trend_id, "trend_score": 0.0, "momentum_score": 0.0, "status": "declining",
                "score_breakdown": None, "scored_at": now,
            })
            continue
        d = derived[trend_id]
        breakdown = {k: pct[k][trend_id] for k in AVAILABLE_COMPONENTS}
        score = round(sum(WEIGHTS[k] * breakdown[k] for k in AVAILABLE_COMPONENTS) / weight_total, 1)
        status = _status(score, d["cur"], d["prev"], d["share_cur"], d["share_prev"], len(a["s30"]))
        avg_conf = sum(a["conf"]) / len(a["conf"])
        updates.append({
            "id": trend_id,
            # Most common spelling; on a tie prefer the shorter, more general name
            "name": max(a["names"].items(), key=lambda kv: (kv[1], -len(kv[0])))[0] if a["names"] else name,
            "trend_score": score,
            "momentum_score": breakdown["mention_growth"],
            "growth_pct": d["growth_pct"],
            "status": status,
            "score_breakdown": {**breakdown, "search_interest": None},
            "confidence": round(min(1.0, math.log1p(len(a["s30"])) / math.log1p(10)) * avg_conf, 2),
            "stats": {
                "window_days": settings.TREND_WINDOW_DAYS,
                "mentions_current": d["cur"],
                "mentions_previous": d["prev"],
                "mentions_30d": len(a["s30"]),
                "sources_30d": len(a["sources"]),
                "celebrities": [n for n, _ in a["celebs"].most_common(10)],
                "brands": [n for n, _ in a["brands"].most_common(10)],
                "runway_mentions": a["runway_mentions"],
            },
            "scored_at": now,
        })
        snapshots.append({
            "trend_id": trend_id, "date": today, "trend_score": score,
            "momentum_score": breakdown["mention_growth"], "mentions_7d": d["cur"], "status": status,
        })

    return updates, snapshots, {"stories_current": total_cur, "stories_previous": total_prev}


def recalculate_scores(db: Session, now: datetime | None = None) -> dict:
    """Score all trends now, update them and record today's snapshot."""
    now = now or _now()
    # small allowance for publish times stamped slightly in the future
    updates, snapshots, totals = _compute_scores(db, now, now + timedelta(days=1))

    # Bulk writes: a handful of round trips instead of one per trend
    scored_rows = [u for u in updates if "name" in u]
    zero_rows = [u for u in updates if "name" not in u]
    if scored_rows:
        db.execute(update(Trend), scored_rows)
    if zero_rows:
        db.execute(update(Trend), zero_rows)
    _write_snapshots(db, snapshots)
    db.commit()
    return {"scored": len(scored_rows), **totals}


def _write_snapshots(db: Session, snapshots: list[dict]):
    for i in range(0, len(snapshots), 1000):
        stmt = insert(TrendSnapshot).values(snapshots[i:i + 1000])
        db.execute(stmt.on_conflict_do_update(
            constraint="uq_trend_snapshots_trend_date",
            set_={c: stmt.excluded[c] for c in ("trend_score", "momentum_score", "mentions_7d", "status")},
        ))


def backfill_snapshots(db: Session, days: int = 30) -> dict:
    """Replay scoring for each past day (as of end of day) so score-history charts have real history.

    Uses only mentions published before each day ended, so it is what the engine would have said then.
    Today is left to recalculate_scores. Safe to re-run (snapshots are upserted).
    """
    today = _now().date()
    written = 0
    for offset in range(days, 0, -1):
        day = today - timedelta(days=offset)
        end_of_day = datetime.combine(day + timedelta(days=1), datetime.min.time(), timezone.utc)
        _, snapshots, _ = _compute_scores(db, end_of_day, end_of_day)
        for snap in snapshots:
            snap["date"] = day
        _write_snapshots(db, snapshots)
        db.commit()
        written += len(snapshots)
    return {"days": days, "snapshots": written}


# ---------------------------------------------------------------------------
# AI explanations
# ---------------------------------------------------------------------------

def _previous_score(db: Session, trend: Trend):
    snap = (
        db.query(TrendSnapshot.trend_score)
        .filter(TrendSnapshot.trend_id == trend.id, TrendSnapshot.date < _now().date())
        .order_by(TrendSnapshot.date.desc())
        .first()
    )
    return snap.trend_score if snap else "n/a (first scored today)"


def explain_trend_now(db: Session, trend: Trend) -> None:
    """Generate and store the trend engine AI analysis for one trend. Raises AIError / AIRateLimited."""
    stats = trend.stats or {}
    evidence_rows = (
        db.query(TrendMention.evidence, Source.name)
        .join(Source, Source.id == TrendMention.source_id)
        .filter(TrendMention.trend_id == trend.id, TrendMention.evidence.isnot(None))
        .order_by(TrendMention.mentioned_at.desc())
        .limit(8)
        .all()
    )
    growth = f"{trend.growth_pct:+.0f}%" if trend.growth_pct is not None else "new this window (no previous mentions)"
    analysis = explain_trend(
        {
            "name": trend.name, "type": trend.type, "category": trend.category,
            "score": trend.trend_score, "previous_score": _previous_score(db, trend), "status": trend.status,
            "window_days": stats.get("window_days"), "mentions_current": stats.get("mentions_current"),
            "mentions_previous": stats.get("mentions_previous"), "mentions_30d": stats.get("mentions_30d"),
            "growth": growth, "sources": stats.get("sources_30d"),
            "celebrities": ", ".join(stats.get("celebrities", [])) or "none",
            "brands": ", ".join(stats.get("brands", [])) or "none",
            "runway_mentions": stats.get("runway_mentions"),
        },
        [f"{source}: {evidence}" for evidence, source in evidence_rows],
    )
    trend.explanation = analysis.model_dump()
    trend.explanation_score = trend.trend_score
    trend.explanation_updated_at = _now()
    db.commit()


def explain_top_trends(db: Session, top_n: int | None = None) -> dict:
    """Refresh AI explanations for the top trends when missing, older than a day, or the score moved."""
    now = _now()
    top = (
        db.query(Trend).filter(Trend.trend_score > 0, Trend.status != "declining")
        .order_by(Trend.trend_score.desc()).limit(top_n or settings.TREND_EXPLAIN_TOP_N).all()
    )
    done, failed = 0, 0
    for trend in top:
        stale = (
            trend.explanation is None
            or trend.explanation_updated_at is None
            or now - trend.explanation_updated_at > EXPLANATION_MAX_AGE
            or abs((trend.explanation_score or 0) - trend.trend_score) >= EXPLANATION_SCORE_CHANGE
        )
        if not stale:
            continue
        try:
            explain_trend_now(db, trend)
            done += 1
        except AIRateLimited:
            db.rollback()
            break  # try again on the next run
        except AIError:
            db.rollback()
            failed += 1
    return {"explained": done, "failed": failed}


def run_trend_engine(db: Session) -> dict:
    """Full hourly run: link new articles, rescore everything, refresh explanations."""
    try:
        result = {"linked": link_unlinked(db)}
    except AIRateLimited as exc:
        db.rollback()
        result = {"linked": {"error": str(exc)}}  # remaining articles are linked on the next run
    result["scores"] = recalculate_scores(db)

    from app.services.alert_service import generate_alerts
    from app.services.forecast_service import update_forecasts
    result["forecasts"] = update_forecasts(db)
    result["alerts"] = generate_alerts(db)
    result["explanations"] = explain_top_trends(db)

    from app.services.entity_service import sync_entities  # imported here: entity_service imports this module
    result["entities"] = sync_entities(db)
    return result
