"""Section news search: pull recent stories about any name (celebrity, brand, topic) into TrendScope.

Providers (free RSS search endpoints, no API key):
  Bing News   - real publisher links, images and summary snippets; ~12 results
  Google News - wider coverage (~35 results) but redirect links and no images
Bing results are kept first; Google adds stories Bing didn't have (matched on headline).

Only the headline, link, a short excerpt and the image URL are stored, never the article itself.
Fetched articles are tagged with the section they were searched from (`vertical_hint`) and then go
through the normal AI pipeline (summary, trends, entities, duplicate detection).
"""
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, quote, urlsplit

import feedparser
import httpx
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Article, Source, TrackedTopic
from app.services.collector_service import (
    MAX_DESCRIPTION_CHARS, USER_AGENT, clean_text, content_hash, normalize_url,
)

TIMEOUT = 20
_SUFFIX_RE = re.compile(r"\s+on MSN$", re.IGNORECASE)


class NewsSearchError(Exception):
    pass


def query_key(query: str) -> str:
    return " ".join(query.lower().split())


def default_region(vertical: str) -> str:
    return "IN" if vertical == "bollywood" else "US"


def _get(url: str):
    try:
        response = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT, follow_redirects=True)
    except httpx.HTTPError as exc:
        raise NewsSearchError(f"Request failed: {type(exc).__name__}") from exc
    if response.status_code >= 400:
        raise NewsSearchError(f"HTTP {response.status_code}")
    return feedparser.parse(response.content)


def _when(entry) -> datetime | None:
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    return datetime(*parsed[:6], tzinfo=timezone.utc) if parsed else None


def _bing(query: str, region: str) -> list[dict]:
    feed = _get(f"https://www.bing.com/news/search?q={quote(query)}&format=rss&setlang=en-{region}&cc={region}")
    items = []
    for e in feed.entries:
        link = e.get("link", "")
        # Bing wraps the publisher URL in a click-tracking link: unwrap it
        real = parse_qs(urlsplit(link).query).get("url", [link])[0]
        publisher = _SUFFIX_RE.sub("", (e.get("news_source") or "").strip()) or urlsplit(real).netloc
        items.append({
            "title": clean_text(e.get("title", "")), "url": real, "publisher": publisher,
            "publisher_url": f"{urlsplit(real).scheme}://{urlsplit(real).netloc}",
            "description": clean_text(e.get("summary", "")), "image_url": e.get("news_image") or None,
            "published_at": _when(e),
        })
    return items


def _google(query: str, region: str, days: int) -> list[dict]:
    feed = _get(
        f"https://news.google.com/rss/search?q={quote(query)}+when:{days}d&hl=en-{region}&gl={region}&ceid={region}:en"
    )
    items = []
    for e in feed.entries:
        source = e.get("source") or {}
        publisher = (source.get("title") or "").strip()
        title = clean_text(e.get("title", ""))
        if publisher and title.endswith(f" - {publisher}"):
            title = title[: -len(publisher) - 3]  # Google appends " - Publisher" to every headline
        items.append({
            "title": title, "url": e.get("link", ""), "publisher": publisher or "Google News",
            "publisher_url": source.get("href") or "https://news.google.com",
            "description": "",  # Google's description just repeats the headline
            "image_url": None, "published_at": _when(e),
        })
    return items


_JUNK_TITLE = re.compile(
    r"\b(wallpapers?|hd (photos|images|pics)|images,? hd|photo ?gallery|pics and videos|latest news|news (and|&) updates|"
    r"biography|net worth|age,? height|filmography|all you need to know about)\b", re.IGNORECASE)
_REFERENCE_SITES = ("imdb.", "wikipedia.", "instagram.", "facebook.", "x.com", "twitter.", "pinterest.", "youtube.")
_STOPWORDS = {"the", "and", "for", "with", "from", "news", "latest", "today", "update", "updates", "new", "about", "photos", "videos", "her", "his"}


def _looks_like_story(item: dict, query: str) -> bool:
    """Search feeds also return profile, tag and gallery pages ("Deepika Padukone News", "HD Wallpapers").
    A real story headline says something beyond the name."""
    if _JUNK_TITLE.search(item["title"]) or any(site in item["url"].lower() for site in _REFERENCE_SITES):
        return False
    name_words = set(re.findall(r"[a-z0-9]+", query.lower()))
    rest = [w for w in re.findall(r"[a-z0-9']+", item["title"].lower()) if w not in name_words and w not in _STOPWORDS and len(w) > 1]
    return len(rest) >= 3


def _clean_publisher(name: str, url: str) -> str:
    if not name or name.startswith("http"):
        return urlsplit(url).netloc.removeprefix("www.") or "Unknown"
    return name


def _normalise(text: str) -> str:
    return " " + " ".join(re.findall(r"[a-z0-9&]+", text.lower().replace("'s ", " "))) + " "


def _relevant(item: dict, query: str) -> bool:
    """The query must appear as a phrase in the headline or snippet, so "Shraddha Kapoor" doesn't match
    "Shraddha Arya ... Ektaa Kapoor". Long queries (4+ words) only need every word somewhere."""
    text = _normalise(f"{item['title']} {item['description']}")
    words = [w for w in _normalise(query).split() if len(w) > 2 or w.isdigit()]
    if not words:
        return True
    if len(words) >= 4:
        return all(f" {w} " in text for w in words)
    return f" {' '.join(words)} " in text


def search_news(query: str, region: str, days: int | None = None) -> tuple[list[dict], list[str]]:
    """Fetch, merge and filter results from both providers. Returns (items, provider_errors)."""
    days = days or settings.NEWS_SEARCH_DAYS
    since = datetime.now(timezone.utc) - timedelta(days=days)
    results, errors, seen = [], [], set()
    for name, fetch in (("Bing", lambda: _bing(query, region)), ("Google", lambda: _google(query, region, days))):
        try:
            batch = fetch()
        except NewsSearchError as exc:
            errors.append(f"{name}: {exc}")
            continue
        for item in batch:
            headline = re.sub(r"[^a-z0-9]+", " ", item["title"].lower()).strip()
            if not item["title"] or not item["url"] or headline in seen:
                continue
            if item["published_at"] and item["published_at"] < since:
                continue
            if not _relevant(item, query) or not _looks_like_story(item, query):
                continue
            item["publisher"] = _clean_publisher(item["publisher"], item["publisher_url"] or item["url"])
            seen.add(headline)
            results.append(item)
    return results, errors


def _publisher_source(db: Session, cache: dict, item: dict) -> Source:
    """Discovered publishers become sources (method news_search) so stories show their real outlet.
    They are never collected by the RSS scheduler."""
    key = f"news-search:{urlsplit(item['publisher_url']).netloc or item['publisher'].lower()}"
    if key in cache:
        return cache[key]
    source = db.query(Source).filter(Source.feed_url == key).first()
    if not source:
        source = Source(
            name=item["publisher"][:200], url=item["publisher_url"], feed_url=key, type="publisher",
            category=None, language="en", collection_method="news_search", active=True, last_status="healthy",
        )
        db.add(source)
        db.flush()
    cache[key] = source
    return source


def fetch_topic(db: Session, topic: TrackedTopic) -> dict:
    """Search news for a topic and save new stories (pending AI processing)."""
    items, errors = search_news(topic.query, topic.region)
    result = {"found": len(items), "new_article_ids": [], "skipped_duplicates": 0, "errors": errors}

    prepared = []
    for item in items:
        description = item["description"][:MAX_DESCRIPTION_CHARS] or None
        prepared.append({
            **item, "canonical_url": normalize_url(item["url"]), "raw_description": description,
            "content_hash": content_hash(item["title"], item["description"] or item["url"]),
        })
    if prepared:
        existing = db.query(Article.canonical_url, Article.content_hash).filter(or_(
            Article.canonical_url.in_([p["canonical_url"] for p in prepared]),
            Article.content_hash.in_([p["content_hash"] for p in prepared]),
        )).all()
        seen_urls = {r.canonical_url for r in existing}
        seen_hashes = {r.content_hash for r in existing}
        cache: dict = {}
        for p in prepared:
            if p["canonical_url"] in seen_urls or p["content_hash"] in seen_hashes:
                result["skipped_duplicates"] += 1
                continue
            seen_urls.add(p["canonical_url"])
            seen_hashes.add(p["content_hash"])
            source = _publisher_source(db, cache, p)
            article = Article(
                source_id=source.id, title=p["title"][:500], url=p["url"], canonical_url=p["canonical_url"],
                published_at=p["published_at"], image_url=p["image_url"], raw_description=p["raw_description"],
                content_hash=p["content_hash"], language="en", category=topic.vertical, status="pending",
                ai_processed=False, vertical_hint=topic.vertical, topic_id=topic.id,
            )
            db.add(article)
            db.flush()
            result["new_article_ids"].append(article.id)

    topic.last_fetched_at = datetime.now(timezone.utc)
    topic.last_new_articles = len(result["new_article_ids"])
    db.flush()
    topic.total_articles = db.query(Article.id).filter(Article.topic_id == topic.id).count()
    topic.last_status = "error" if errors and not items else ("ok" if items else "empty")
    topic.last_error = "; ".join(errors) or None
    db.commit()
    return result


def fetch_active_topics(db: Session) -> dict:
    topics = db.query(TrackedTopic).filter(TrackedTopic.active.is_(True)).all()
    new = 0
    for topic in topics:
        try:
            new += len(fetch_topic(db, topic)["new_article_ids"])
        except Exception:
            db.rollback()  # one bad topic must not stop the others
    return {"topics": len(topics), "new_articles": new}
