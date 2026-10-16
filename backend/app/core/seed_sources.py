"""Seed the sources table with publisher RSS feeds. Safe to re-run: existing feed URLs are skipped.

Run from the backend/ directory:  python -m app.core.seed_sources
"""
from app.core.database import SessionLocal
from app.models import Source

# (name, site url, feed url, category, country)
SEED_SOURCES = [
    # Fashion
    ("Vogue", "https://www.vogue.com", "https://www.vogue.com/feed/rss", "fashion", "US"),
    ("Elle", "https://www.elle.com", "https://www.elle.com/rss/all.xml/", "fashion", "US"),
    ("Harper's Bazaar", "https://www.harpersbazaar.com", "https://www.harpersbazaar.com/rss/all.xml/", "fashion", "US"),
    ("Glamour", "https://www.glamour.com", "https://www.glamour.com/feed/rss", "fashion", "US"),
    ("WWD", "https://wwd.com", "https://wwd.com/feed/", "fashion", "US"),
    ("Fashionista", "https://fashionista.com", "https://fashionista.com/.rss/full/", "fashion", "US"),
    ("Who What Wear", "https://www.whowhatwear.com", "https://www.whowhatwear.com/feeds.xml", "fashion", "US"),
    ("Refinery29 Fashion", "https://www.refinery29.com/en-us/fashion", "https://www.refinery29.com/en-us/fashion/rss.xml", "fashion", "US"),
    ("Vogue India", "https://www.vogue.in", "https://www.vogue.in/feed/rss", "fashion", "IN"),
    # Streetwear
    ("Hypebeast Fashion", "https://hypebeast.com/fashion", "https://hypebeast.com/fashion/feed", "streetwear", "US"),
    ("Highsnobiety", "https://www.highsnobiety.com", "https://www.highsnobiety.com/feeds/rss", "streetwear", "DE"),
    # Bollywood / India
    ("Bollywood Hungama", "https://www.bollywoodhungama.com", "https://www.bollywoodhungama.com/feed/", "bollywood", "IN"),
    ("Pinkvilla", "https://www.pinkvilla.com", "https://www.pinkvilla.com/rss.xml", "bollywood", "IN"),
    ("Filmfare", "https://www.filmfare.com", "https://www.filmfare.com/feeds/feeds.xml", "bollywood", "IN"),
    ("Times of India Life & Style", "https://timesofindia.indiatimes.com/life-style", "https://timesofindia.indiatimes.com/rssfeeds/2886704.cms", "bollywood", "IN"),
    ("Indian Express Fashion", "https://indianexpress.com/section/lifestyle/fashion/", "https://indianexpress.com/section/lifestyle/fashion/feed/", "bollywood", "IN"),
    # Hollywood / celebrity
    ("Variety", "https://variety.com", "https://variety.com/feed/", "hollywood", "US"),
    ("The Hollywood Reporter", "https://www.hollywoodreporter.com", "https://www.hollywoodreporter.com/feed/", "hollywood", "US"),
    ("Deadline", "https://deadline.com", "https://deadline.com/feed/", "hollywood", "US"),
    ("E! News", "https://www.eonline.com", "https://eol-feeds.eonline.com/rssfeed/us/top_stories", "celebrity", "US"),
    ("Just Jared", "https://www.justjared.com", "https://www.justjared.com/feed/", "celebrity", "US"),
]


def seed():
    db = SessionLocal()
    try:
        existing = {url for (url,) in db.query(Source.feed_url).all()}
        added = 0
        for name, url, feed_url, category, country in SEED_SOURCES:
            if feed_url in existing:
                continue
            db.add(Source(
                name=name, url=url, feed_url=feed_url, category=category, country=country,
                type="publisher", language="en", collection_method="rss", active=True,
            ))
            added += 1
        db.commit()
        print(f"Added {added} sources ({len(SEED_SOURCES) - added} already present).")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
