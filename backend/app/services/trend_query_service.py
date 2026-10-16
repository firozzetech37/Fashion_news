"""Read-side queries for the trends API and homepage."""
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Article, Source, Trend, TrendMention, TrendSnapshot
from app.schemas.article import ArticleOut
from app.schemas.trend import TrendSummary


def _days(n: int) -> list[date]:
    today = datetime.now(timezone.utc).date()
    return [today - timedelta(days=i) for i in range(n - 1, -1, -1)]


def daily_counts(db: Session, trend_ids: list[str], days: int) -> dict[str, list[int]]:
    """Distinct stories mentioning each trend per day, oldest first."""
    if not trend_ids:
        return {}
    day_list = _days(days)
    day_col = func.date(TrendMention.mentioned_at)
    story = func.coalesce(Article.duplicate_of_id, Article.id)
    rows = (
        db.query(TrendMention.trend_id, day_col.label("day"), func.count(func.distinct(story)))
        .join(Article, Article.id == TrendMention.article_id)
        .filter(TrendMention.trend_id.in_(trend_ids), TrendMention.mentioned_at >= datetime.combine(day_list[0], datetime.min.time(), timezone.utc))
        .group_by(TrendMention.trend_id, day_col)
        .all()
    )
    counts = defaultdict(dict)
    for tid, day, n in rows:
        counts[tid][day] = n
    return {tid: [counts[tid].get(d, 0) for d in day_list] for tid in trend_ids}


def summaries(db: Session, trends: list[Trend], spark_days: int = 14) -> list[TrendSummary]:
    sparks = daily_counts(db, [t.id for t in trends], spark_days)
    return [TrendSummary.model_validate(t).model_copy(update={"sparkline": sparks.get(t.id, [])}) for t in trends]


def trend_detail_parts(db: Session, trend: Trend) -> dict:
    day_list = _days(30)
    timeline = daily_counts(db, [trend.id], 30)[trend.id]

    history = (
        db.query(TrendSnapshot).filter(TrendSnapshot.trend_id == trend.id)
        .order_by(TrendSnapshot.date.desc()).limit(90).all()
    )

    rows = (
        db.query(Article, Source.name)
        .join(TrendMention, TrendMention.article_id == Article.id)
        .join(Source, Source.id == Article.source_id)
        .filter(TrendMention.trend_id == trend.id)
        .order_by(Article.published_at.desc().nulls_last())
        .all()
    )
    celebs, brands, sources = Counter(), Counter(), Counter()
    for article, source_name in rows:
        ents = article.entities or {}
        celebs.update(set(ents.get("celebrities") or []))
        brands.update(set((ents.get("brands") or []) + (ents.get("designers") or [])))
        sources[source_name] += 1
    articles = [
        ArticleOut.model_validate(a).model_copy(update={"source_name": n})
        for a, n in rows if a.duplicate_of_id is None
    ][:12]

    # Related: trends that appear in the same articles, then nearest by embedding
    article_ids = [a.id for a, _ in rows]
    co = (
        db.query(Trend, func.count(TrendMention.article_id).label("shared"))
        .join(TrendMention, TrendMention.trend_id == Trend.id)
        .filter(TrendMention.article_id.in_(article_ids), Trend.id != trend.id)
        .group_by(Trend.id).order_by(func.count(TrendMention.article_id).desc(), Trend.trend_score.desc())
        .limit(6).all()
    ) if article_ids else []
    related = [{"name": t.name, "slug": t.slug, "status": t.status, "trend_score": t.trend_score, "shared_articles": n} for t, n in co]
    if len(related) < 6 and trend.embedding is not None:
        seen = {r["slug"] for r in related} | {trend.slug}
        distance = Trend.embedding.cosine_distance(trend.embedding)
        for t in db.query(Trend).filter(Trend.id != trend.id, Trend.embedding.isnot(None)).order_by(distance).limit(10):
            if t.slug not in seen and len(related) < 6:
                related.append({"name": t.name, "slug": t.slug, "status": t.status, "trend_score": t.trend_score, "shared_articles": 0})

    top = lambda c: [{"name": n, "count": k} for n, k in c.most_common(10)]
    return {
        "timeline": [{"date": d, "mentions": n} for d, n in zip(day_list, timeline)],
        "sparkline": timeline[-14:],
        "score_history": [
            {"date": s.date, "trend_score": s.trend_score, "momentum_score": s.momentum_score, "status": s.status}
            for s in reversed(history)
        ],
        "celebrities": top(celebs),
        "brands": top(brands),
        "sources": top(sources),
        "related": related,
        "articles": articles,
    }


def top_celebrities(db: Session, days: int = 14, limit: int = 8) -> list[dict]:
    """Celebrities appearing most in fashion-relevant stories, with a recent image and their linked trends."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    articles = (
        db.query(Article.entities, Article.image_url, Article.title, Article.url, Article.ai_trends)
        .filter(
            Article.status == "processed", Article.duplicate_of_id.is_(None),
            Article.fashion_relevance >= 0.5,
            func.coalesce(Article.published_at, Article.collected_at) >= since,
        )
        .order_by(Article.published_at.desc().nulls_last())
        .all()
    )
    stats: dict[str, dict] = {}
    for a in articles:
        for name in set((a.entities or {}).get("celebrities") or []):
            s = stats.setdefault(name, {"name": name, "articles": 0, "image_url": None, "headline": None, "url": None, "trends": Counter()})
            s["articles"] += 1
            if not s["image_url"] and a.image_url:
                s["image_url"], s["headline"], s["url"] = a.image_url, a.title, a.url
            s["trends"].update(t["name"] for t in (a.ai_trends or []))
    ranked = sorted(stats.values(), key=lambda s: (-s["articles"], s["image_url"] is None))[:limit]
    return [{**s, "trends": [n for n, _ in s["trends"].most_common(3)]} for s in ranked]
