"""Look up Google search interest from the GitHub Actions runner and upload it to the TrendScope API.

Google refuses requests from Render's servers, so the scheduled GitHub job runs this instead:
  1. GET  {API_URL}/api/jobs/search-queue   which trends need search data (top-scored first)
  2. Google Trends, one trend at a time, pausing between them; stops at the first refusal (HTTP 429)
  3. POST {API_URL}/api/jobs/search-results  the daily series; the API stores and summarizes them

Standard library only, so the runner needs no installs.
Env: API_URL, JOBS_TOKEN (required); SEARCH_LIMIT (default 6), SEARCH_DELAY_SECONDS (default 4).
Exit code is 0 even when Google refuses: the next run simply tries again.
"""
import http.cookiejar
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

GOOGLE = "https://trends.google.com/trends"
TIMEFRAME = "today 3-m"
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/141.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


class RateLimited(Exception):
    pass


class NetworkError(Exception):
    """Couldn't reach Google at all (DNS, TLS, timeout). Not the keyword's fault: nothing is recorded."""


def google_client():
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    opener.addheaders = list(BROWSER_HEADERS.items())
    try:
        opener.open(f"{GOOGLE}/explore?geo=US", timeout=20)  # sets the NID cookie; often answers 429, that's fine
    except (urllib.error.URLError, TimeoutError):
        pass
    return opener


def google_json(opener, path: str, params: dict) -> dict:
    url = f"{GOOGLE}/api/{path}?{urllib.parse.urlencode(params)}"
    try:
        with opener.open(url, timeout=20) as r:
            text = r.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            raise RateLimited() from exc
        raise RuntimeError(f"HTTP {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise NetworkError(str(exc)) from exc
    start = text.find("{")  # Google prefixes its JSON with junk like )]}'
    if start < 0:
        raise RuntimeError("unexpected response")
    return json.loads(text[start:])


def interest_over_time(opener, keyword: str, geo: str) -> list[list]:
    req = {"comparisonItem": [{"keyword": keyword, "geo": geo, "time": TIMEFRAME}], "category": 0, "property": ""}
    explore = google_json(opener, "explore", {"hl": "en-US", "tz": "0", "req": json.dumps(req)})
    widget = next((w for w in explore.get("widgets", []) if w.get("id") == "TIMESERIES"), None)
    if not widget:
        raise RuntimeError("no time series widget")
    data = google_json(opener, "widgetdata/multiline", {
        "hl": "en-US", "tz": "0", "req": json.dumps(widget["request"]), "token": widget["token"],
    })
    points = []
    for p in data.get("default", {}).get("timelineData", []):
        if p.get("isPartial") or not p.get("hasData", [True])[0]:
            continue
        day = datetime.fromtimestamp(int(p["time"]), timezone.utc).date().isoformat()
        points.append([day, int(p["value"][0])])
    return points


def api(method: str, url: str, token: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "X-Jobs-Token": token, "Content-Type": "application/json", "User-Agent": "trendscope-github-actions",
    })
    with urllib.request.urlopen(req, timeout=90) as r:  # a sleeping free Render instance can take a while
        return json.loads(r.read().decode("utf-8"))


def main() -> int:
    # Secrets are pasted by hand: ignore stray whitespace and wrapping quotes, like the trigger step does
    api_url = os.environ.get("API_URL", "").strip().strip("'\"").strip().rstrip("/")
    token = os.environ.get("JOBS_TOKEN", "").strip().strip("'\"").strip()
    if not api_url or not token:
        print("::error::API_URL and JOBS_TOKEN must be set.")
        return 1
    limit = int(os.environ.get("SEARCH_LIMIT") or 6)
    delay = float(os.environ.get("SEARCH_DELAY_SECONDS") or 4)

    queue = api("GET", f"{api_url}/api/jobs/search-queue?limit={limit}", token)
    trends, geo = queue.get("trends", []), queue.get("geo", "")
    print(f"{len(trends)} trends need search data (geo: {geo or 'worldwide'})")
    if not trends:
        return 0

    opener = google_client()
    results, rate_limited = [], False
    for i, t in enumerate(trends):
        if i:
            time.sleep(delay)
        try:
            series = interest_over_time(opener, t["keyword"], geo)
            results.append({"trend_id": t["trend_id"], "keyword": t["keyword"], "series": series})
            has_data = any(v for _, v in series)
            print(f"  {t['keyword']}: {len(series)} days{'' if has_data else ' (too few searches)'}")
        except RateLimited:
            rate_limited = True
            print(f"  {t['keyword']}: Google refused (rate limited); stopping for this run")
            break
        except NetworkError as exc:
            print(f"::warning::Couldn't reach Google ({exc}); stopping for this run")
            break
        except Exception as exc:  # one bad keyword must not stop the rest
            results.append({"trend_id": t["trend_id"], "keyword": t["keyword"], "error": str(exc)[:300]})
            print(f"  {t['keyword']}: failed ({exc})")

    if results:
        stored = api("POST", f"{api_url}/api/jobs/search-results", token,
                     {"geo": geo, "rate_limited": rate_limited, "results": results})
        print(f"Uploaded: {stored}")
    if rate_limited and not results:
        print("::warning::Google refused the first search lookup from this runner. The next run will try again.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
