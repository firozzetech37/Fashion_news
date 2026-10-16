"""Builds the celebrity and brand tables from the entities the AI extracted from articles."""
import math
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.ai.client import AIError, AIRateLimited
from app.ai.entity_profiler import profile_celebrities
from app.core.config import settings
from app.models import Article, Entity, EntityProfile, Source, Trend, TrendMention
from app.services.trend_service import _percentiles, slugify
from app.services.verticals import article_vertical

KINDS = {"celebrity": "celebrities", "brand": "brands"}
PROFILE_BATCH = 60


def ensure_profiles(db: Session, names: list[str]) -> dict[str, EntityProfile]:
    """Classify celebrities that don't have a cached profile yet. Stops quietly on rate limits."""
    profiles = {p.key: p for p in db.query(EntityProfile).filter(EntityProfile.kind == "celebrity")}
    missing = [n for n in names if n.lower() not in profiles]
    for i in range(0, len(missing), PROFILE_BATCH):
        batch = missing[i:i + PROFILE_BATCH]
        try:
            result = profile_celebrities(batch)
        except (AIError, AIRateLimited):
            break  # unprofiled celebrities fall back to the article-based vertical; retried next run
        wanted = {n.lower() for n in batch}
        for p in result.profiles:
            key = p.name.strip().lower()
            if key in wanted and key not in profiles:
                profile = EntityProfile(
                    kind="celebrity", key=key,
                    country=None if p.country.lower() == "unknown" else p.country.upper()[:2],
                    industry=p.industry, known_for=p.known_for or None,
                )
                db.add(profile)
                profiles[key] = profile
        db.commit()
    return profiles


def celebrity_vertical(profile: EntityProfile | None, fallback: str) -> str:
    """Indian public figures belong to the Bollywood vertical, everyone else to Hollywood."""
    if profile and profile.country:
        return "bollywood" if profile.country == "IN" else "hollywood"
    return fallback


def sync_entities(db: Session) -> dict:
    """Rebuild the entities table (derived data, so a full rebuild keeps it simple and consistent)."""
    now = datetime.now(timezone.utc)
    since_30d = now - timedelta(days=30)
    publishers = {name.lower() for (name,) in db.query(Source.name)}

    rows = (
        db.query(
            Article.id, Article.entities, Article.category, Article.fashion_relevance, Article.published_at,
            Article.collected_at, Article.image_url, Article.title, Article.signals, Source.category.label("source_category"),
        )
        .join(Source, Source.id == Article.source_id)
        .filter(Article.status == "processed", Article.duplicate_of_id.is_(None))
        .order_by(Article.published_at.desc().nulls_last())
        .all()
    )
    trends_by_article = defaultdict(list)
    for article_id, slug, name in (
        db.query(TrendMention.article_id, Trend.slug, Trend.name).join(Trend, Trend.id == TrendMention.trend_id)
    ):
        trends_by_article[article_id].append((slug, name))

    agg = {kind: {} for kind in KINDS}
    for r in rows:
        ents = r.entities or {}
        when = r.published_at or r.collected_at
        relevant = (r.fashion_relevance or 0) >= settings.TREND_MIN_RELEVANCE
        # Ordered and de-duplicated: the first-named person is usually the one in the photo
        names_by_kind = {
            kind: list(dict.fromkeys(n.strip() for n in ents.get(key) or [] if n and n.strip()))
            for kind, key in KINDS.items()
        }
        names_by_kind["brand"] = [n for n in names_by_kind["brand"] if n.lower() not in publishers]
        vertical = article_vertical(r.category, r.source_category)
        signals = r.signals or {}

        for kind, names in names_by_kind.items():
            other = names_by_kind["brand" if kind == "celebrity" else "celebrity"]
            adoption = signals.get("celebrity_adoption" if kind == "celebrity" else "brand_adoption", 0)
            for position, name in enumerate(names):
                e = agg[kind].setdefault(name.lower(), {
                    "names": Counter(), "stories": 0, "s30": 0, "f30": 0, "adoption": 0.0, "verticals": Counter(),
                    "image": None, "image_rank": 9, "headline": None, "trends": Counter(), "related": Counter(),
                    "first": when, "last": when,
                })
                e["names"][name] += 1
                e["stories"] += 1
                e["verticals"][vertical] += 1
                e["first"], e["last"] = min(e["first"], when), max(e["last"], when)
                if when >= since_30d:
                    e["s30"] += 1
                    if relevant:
                        e["f30"] += 1
                        e["adoption"] += adoption
                if relevant:
                    # Photo choice: sole subject > first named > anyone; rows are newest first,
                    # so within a rank the most recent story wins
                    rank = 0 if len(names) == 1 else 1 if position == 0 else 2
                    if r.image_url and rank < e["image_rank"]:
                        e["image"], e["headline"], e["image_rank"] = r.image_url, r.title, rank
                    e["trends"].update(trends_by_article.get(r.id, []))
                    e["related"].update(n.lower() for n in other)

    # Stable display names and slugs first (related lists need the other kind's slugs)
    meta = {}
    for kind, entities in agg.items():
        taken = set()
        for key, e in sorted(entities.items(), key=lambda kv: (-kv[1]["stories"], kv[0])):
            name = max(e["names"].items(), key=lambda kv: (kv[1], kv[0][:1].isupper(), -len(kv[0])))[0]
            slug, n = slugify(name), 2
            while slug in taken:
                slug, n = f"{slugify(name)}-{n}", n + 1
            taken.add(slug)
            meta[(kind, key)] = (name, slug)

    # Profile celebrities that have any fashion relevance (the long tail isn't shown in listings)
    profiles = ensure_profiles(db, [
        meta[("celebrity", key)][0] for key, e in agg["celebrity"].items() if e["f30"] > 0 or e["stories"] >= 2
    ])

    inserts = []
    for kind, entities in agg.items():
        # Repeated fashion coverage drives influence; linked trends add a bonus capped by story count
        # so one trend-heavy article can't outrank someone covered week after week.
        raw = {
            key: e["f30"] * (1 + e["adoption"] / max(e["f30"], 1)) + 0.25 * min(len(e["trends"]), 2 * e["f30"])
            for key, e in entities.items()
        }
        influence = _percentiles(raw)
        other_kind = "brand" if kind == "celebrity" else "celebrity"
        for key, e in entities.items():
            name, slug = meta[(kind, key)]
            related = [
                {"name": meta[(other_kind, k)][0], "slug": meta[(other_kind, k)][1], "count": c}
                for k, c in e["related"].most_common(8) if (other_kind, k) in meta
            ]
            profile = profiles.get(key) if kind == "celebrity" else None
            vertical = e["verticals"].most_common(1)[0][0]
            inserts.append({
                "kind": kind, "name": name, "slug": slug, "aliases": sorted(e["names"]),
                "vertical": celebrity_vertical(profile, vertical) if kind == "celebrity" else vertical,
                "country": profile.country if profile else None,
                "industry": profile.industry if profile else None,
                "known_for": profile.known_for if profile else None,
                "image_url": e["image"], "image_headline": e["headline"],
                "stories_total": e["stories"], "stories_30d": e["s30"], "fashion_stories_30d": e["f30"],
                "influence_score": influence[key],
                "top_trends": [{"slug": s, "name": n, "count": c} for (s, n), c in e["trends"].most_common(8)],
                "related": related, "first_seen": e["first"], "last_seen": e["last"],
            })

    db.query(Entity).delete()
    for i in range(0, len(inserts), 500):
        db.execute(insert(Entity), inserts[i:i + 500])
    db.commit()
    return {kind: len(entities) for kind, entities in agg.items()}
