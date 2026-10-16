"""Ask TrendScope: retrieval-augmented answers grounded in TrendScope's own data.

1. Retrieve: trends and articles nearest to the question (pgvector), the current top trends for
   general questions, and any celebrity/brand named in the question.
2. Generate: the model only sees that context, each item tagged with a reference id (T1, A1...).
3. Resolve: cited reference ids are mapped back to real trends/articles; anything the model made up
   (an id that wasn't in the context) is dropped.
"""
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.ai.assistant import answer_question
from app.ai.embeddings import embed_text
from app.models import Article, Entity, Source, Trend
from app.schemas.article import ArticleOut
from app.services.trend_query_service import summaries

TREND_MAX_DISTANCE = 0.20    # looser than search: the model filters for relevance
ARTICLE_MAX_DISTANCE = 0.24
MAX_TRENDS, MAX_ARTICLES = 12, 12


def _trend_line(ref: str, t: Trend) -> str:
    stats = t.stats or {}
    growth = "new" if t.growth_pct is None else f"{t.growth_pct:+.0f}% share of voice"
    forecast = (t.forecast or {}).get("label", "unknown").replace("_", " ")
    why = (t.explanation or {}).get("why_trending", "")
    people = ", ".join(stats.get("celebrities", [])[:4])
    brands = ", ".join(stats.get("brands", [])[:4])
    return (
        f"[{ref}] {t.name} ({t.type}, {t.category}) | status {t.status}, score {round(t.trend_score)}/100, {growth} | "
        f"{stats.get('mentions_30d', 0)} stories from {stats.get('sources_30d', 0)} sources in 30 days | forecast: {forecast}"
        + (f" | celebrities: {people}" if people else "") + (f" | brands: {brands}" if brands else "")
        + (f" | analysis: {why}" if why else "")
    )


def _article_line(ref: str, a: Article, source: str) -> str:
    date = a.published_at.date().isoformat() if a.published_at else "undated"
    trends = ", ".join(t["name"] for t in (a.ai_trends or [])[:4])
    return f"[{ref}] {a.title} | {source}, {date} | {a.ai_summary or ''}" + (f" | trends: {trends}" if trends else "")


def _named_entities(db: Session, question: str) -> list[Entity]:
    """Celebrities/brands mentioned by name in the question (match on names only, then load the hits)."""
    q = question.lower()
    names = db.query(Entity.id, Entity.name).filter(Entity.influence_score > 0).order_by(Entity.influence_score.desc()).limit(400)
    ids = [i for i, name in names if len(name) > 3 and re.search(rf"\b{re.escape(name.lower())}\b", q)][:4]
    return db.query(Entity).filter(Entity.id.in_(ids)).all() if ids else []


def ask(db: Session, question: str) -> dict:
    vector = embed_text(question)

    # Trends: semantically related first, then today's top trends for broad questions
    distance = Trend.embedding.cosine_distance(vector)
    related = [
        t for t, d in db.query(Trend, distance).filter(Trend.trend_score > 0, Trend.embedding.isnot(None))
        .order_by(distance).limit(MAX_TRENDS) if d <= TREND_MAX_DISTANCE
    ]
    top = db.query(Trend).filter(Trend.trend_score > 0, Trend.status != "declining").order_by(Trend.trend_score.desc()).limit(8).all()
    trends = list({t.id: t for t in related + top}.values())[: MAX_TRENDS + 4]

    a_distance = Article.embedding.cosine_distance(vector)
    articles = [
        (a, s) for a, s, d in db.query(Article, Source.name, a_distance)
        .join(Source, Source.id == Article.source_id)
        .filter(Article.status == "processed", Article.duplicate_of_id.is_(None), Article.embedding.isnot(None))
        .order_by(a_distance).limit(MAX_ARTICLES) if d <= ARTICLE_MAX_DISTANCE
    ]
    entities = _named_entities(db, question)

    trend_refs = {f"T{i + 1}": t for i, t in enumerate(trends)}
    article_refs = {f"A{i + 1}": (a, s) for i, (a, s) in enumerate(articles)}
    sections = [
        "TRENDS (related to the question, plus today's top trends):\n" + "\n".join(_trend_line(r, t) for r, t in trend_refs.items()),
        "ARTICLES (most related recent stories):\n" + ("\n".join(_article_line(r, a, s) for r, (a, s) in article_refs.items()) or "(none closely related)"),
    ]
    if entities:
        sections.append("PEOPLE AND BRANDS NAMED IN THE QUESTION:\n" + "\n".join(
            f"- {e.name} ({e.kind}{', ' + e.known_for if e.known_for else ''}): {e.fashion_stories_30d} fashion stories in 30 days, "
            f"influence {round(e.influence_score)}/100, linked trends: {', '.join(t['name'] for t in e.top_trends[:5]) or 'none'}"
            for e in entities
        ))

    oldest = db.query(func.min(Article.published_at)).filter(
        Article.published_at >= datetime.now(timezone.utc) - timedelta(days=30)
    ).scalar()
    window = f"stories from {oldest:%d %b} to {datetime.now(timezone.utc):%d %b %Y}" if oldest else "recent stories"
    result = answer_question(question, "\n\n".join(sections), window)

    # Only keep citations that point at real context items
    cited_trends = [(trend_refs[h.ref], h.reason) for h in result.highlighted_trends if h.ref in trend_refs][:6]
    cited_articles = [article_refs[r] for r in result.cited_articles if r in article_refs][:6]
    trend_summaries = summaries(db, [t for t, _ in cited_trends])
    return {
        "question": question,
        "answer": re.sub(r"\s*\[(?:T|A)\d+\]", "", result.answer).strip(),  # strip stray reference ids
        "confidence": result.confidence,
        "trends": [{"trend": s, "reason": reason} for s, (_, reason) in zip(trend_summaries, cited_trends)],
        "articles": [ArticleOut.model_validate(a).model_copy(update={"source_name": s}) for a, s in cited_articles],
        "follow_up_questions": result.follow_up_questions[:3],
        "signals_used": {"trends": len(trend_refs), "articles": len(article_refs), "entities": len(entities)},
    }
