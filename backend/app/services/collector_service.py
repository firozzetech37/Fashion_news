"""RSS ingestion: fetch -> normalize -> deduplicate -> save.

AI processing is intentionally NOT done here. New articles are saved with
status="pending" and are picked up by the AI queue (Week 3).
"""
import hashlib
import html
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import feedparser
import httpx
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import Article, Source

USER_AGENT = "Mozilla/5.0 (compatible; TrendScopeBot/0.1; +https://trendscope.app)"
FETCH_TIMEOUT = 20
MAX_DESCRIPTION_CHARS = 1000  # keep only a short excerpt, never the full article
TRACKING_PARAMS = {"fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src", "cmpid", "src"}

_TAG_RE = re.compile(r"<[^>]+>")
_IMG_RE = re.compile(r"<img[^>]+src=[\"']([^\"']+)[\"']", re.IGNORECASE)
_WS_RE = re.compile(r"\s+")


class FeedError(Exception):
    pass


def normalize_url(url: str) -> str:
    """Canonical form used for deduplication: lowercase host, no tracking params, fragment or trailing slash."""
    parts = urlsplit(url.strip())
    query = [
        (k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if not k.lower().startswith("utm_") and k.lower() not in TRACKING_PARAMS
    ]
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower() or "https", parts.netloc.lower(), path, urlencode(query), ""))


def clean_text(value: str) -> str:
    return _WS_RE.sub(" ", html.unescape(_TAG_RE.sub(" ", value or ""))).strip()


def content_hash(title: str, description: str) -> str:
    basis = f"{clean_text(title).lower()}|{clean_text(description).lower()[:500]}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def _entry_datetime(entry) -> Optional[datetime]:
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if not parsed:
        return None
    return datetime(*parsed[:6], tzinfo=timezone.utc)


def _entry_image(entry) -> Optional[str]:
    for key in ("media_content", "media_thumbnail"):
        for media in entry.get(key) or []:
            if media.get("url"):
                return media["url"]
    for enclosure in entry.get("enclosures") or []:
        if (enclosure.get("type") or "").startswith("image") and enclosure.get("href"):
            return enclosure["href"]
    raw_html = entry.get("summary", "") or ""
    for content in entry.get("content") or []:
        raw_html += content.get("value", "")
    match = _IMG_RE.search(raw_html)
    return match.group(1) if match else None


_LATIN1_DECL = re.compile(rb'(<\?xml[^>]*encoding=["\'])(iso-8859-1|latin-?1|windows-1252)(["\'])', re.IGNORECASE)
_UTF8_MULTIBYTE = re.compile(rb"[\xc2-\xf4][\x80-\xbf]")


def fix_declared_encoding(content: bytes) -> bytes:
    """Some feeds (e.g. Filmfare) declare Latin-1 but actually send UTF-8, which garbles quotes into 'â'.

    If the bytes contain real UTF-8 multi-byte characters, trust the bytes over the declaration.
    Filmfare also truncates some curly quotes to a lone lead byte; those were quotes, so they become "'".
    """
    if not _LATIN1_DECL.search(content[:300]) or not _UTF8_MULTIBYTE.search(content):
        return content  # declared UTF-8 already, or genuinely Latin-1
    text = content.decode("utf-8", errors="replace").replace("\ufffd", "'")
    return _LATIN1_DECL.sub(rb"\1utf-8\3", text.encode("utf-8"), count=1)


def fetch_feed(feed_url: str):
    """Download and parse a feed. Raises FeedError when nothing usable comes back."""
    try:
        response = httpx.get(
            feed_url,
            headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/xml, text/xml, */*"},
            timeout=FETCH_TIMEOUT,
            follow_redirects=True,
        )
    except httpx.HTTPError as exc:
        raise FeedError(f"Request failed: {type(exc).__name__}") from exc
    if response.status_code >= 400:
        raise FeedError(f"HTTP {response.status_code}")

    feed = feedparser.parse(fix_declared_encoding(response.content))
    if not feed.entries and feed.bozo:
        raise FeedError(f"Not a valid feed: {feed.get('bozo_exception', 'parse error')}")
    return feed


def parse_entry(entry) -> Optional[dict]:
    link = entry.get("link")
    title = clean_text(entry.get("title", ""))
    if not link or not title:
        return None
    description = clean_text(entry.get("summary") or entry.get("description") or "")
    return {
        "title": title[:500],
        "url": link,
        "canonical_url": normalize_url(link),
        "author": clean_text(entry.get("author", ""))[:200] or None,
        "published_at": _entry_datetime(entry),
        "image_url": _entry_image(entry),
        "raw_description": description[:MAX_DESCRIPTION_CHARS] or None,
        "content_hash": content_hash(title, description),
    }


def preview_feed(feed_url: str, limit: int = 5) -> dict:
    """Fetch a feed without saving anything, for the admin 'Test' button."""
    try:
        feed = fetch_feed(feed_url)
    except FeedError as exc:
        return {"ok": False, "error": str(exc)}
    items = [p for p in (parse_entry(e) for e in feed.entries) if p]
    return {
        "ok": bool(items),
        "feed_title": clean_text(feed.feed.get("title", "")) or None,
        "entry_count": len(items),
        "error": None if items else "Feed has no usable entries",
        "sample": [
            {k: item[k] for k in ("title", "url", "published_at", "image_url")}
            for item in items[:limit]
        ],
    }


def collect_source(db: Session, source: Source) -> dict:
    """Collect one source and record its health. Never raises for feed problems."""
    result = {"source_id": source.id, "status": "error", "new_articles": 0, "skipped_duplicates": 0, "error": None}
    try:
        feed = fetch_feed(source.feed_url)
        items = [p for p in (parse_entry(e) for e in feed.entries) if p]

        # Deduplicate within this batch first, then against the database in one query
        batch = {}
        for item in items:
            batch.setdefault(item["canonical_url"], item)
        unique = {}
        for item in batch.values():
            unique.setdefault(item["content_hash"], item)

        existing = db.query(Article.canonical_url, Article.content_hash).filter(
            or_(
                Article.canonical_url.in_([i["canonical_url"] for i in unique.values()]),
                Article.content_hash.in_(list(unique.keys())),
            )
        ).all() if unique else []
        seen_urls = {row.canonical_url for row in existing}
        seen_hashes = {row.content_hash for row in existing}

        new_items = [
            i for i in unique.values()
            if i["canonical_url"] not in seen_urls and i["content_hash"] not in seen_hashes
        ]
        for item in new_items:
            db.add(Article(
                source_id=source.id,
                language=source.language,
                category=source.category,  # provisional; the AI pipeline will reclassify
                status="pending",
                ai_processed=False,
                **item,
            ))

        result["new_articles"] = len(new_items)
        result["skipped_duplicates"] = len(items) - len(new_items)
        result["status"] = "healthy" if items else "warning"
        if not items:
            result["error"] = "Feed returned no usable entries"
        source.consecutive_failures = 0
    except FeedError as exc:
        db.rollback()
        result["error"] = str(exc)
        source.consecutive_failures = (source.consecutive_failures or 0) + 1
    except Exception as exc:  # unexpected (e.g. DB error): record it, don't crash the whole run
        db.rollback()
        result["error"] = f"{type(exc).__name__}: {exc}"[:500]
        source.consecutive_failures = (source.consecutive_failures or 0) + 1

    source.last_collected_at = datetime.now(timezone.utc)
    source.last_status = result["status"]
    source.last_error = result["error"]
    source.last_new_articles = result["new_articles"]
    db.commit()
    return result


def collect_all_active(db: Session) -> list[dict]:
    sources = db.query(Source).filter(Source.active.is_(True), Source.collection_method == "rss").all()
    return [collect_source(db, source) for source in sources]
