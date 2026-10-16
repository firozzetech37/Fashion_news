"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Download, ExternalLink, Radio, Search, X } from "lucide-react"
import { cn } from "cn"
import { API_URL, authHeaders, type Article } from "@/lib/api"
import { TimeAgo } from "@/components/trends/time-ago"
import { entityPath, timeAgo, type SearchResults, type Vertical } from "@/lib/trends"

interface Topic {
  id: number
  query: string
  vertical: string
  active: boolean
  last_fetched_at: string | null
  last_status: string | null
  last_new_articles: number | null
  total_articles: number
}

interface FetchResult {
  topic: Topic
  found: number
  new_articles: number
  skipped_duplicates: number
  articles: Article[]
  cached?: boolean         // fetched recently by someone else: these are the saved stories
  tracking_ignored?: boolean
  corrected_from?: string  // nothing found as typed; this is what was searched instead
  suggestion?: string      // nothing found either way; a spelling to try
}

type Me = { signed_in: boolean; is_admin: boolean; email?: string }

async function errorText(res: Response) {
  try {
    const body = await res.json()
    return typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

/** Search a section's stories; admins can also pull the latest news about the name and keep tracking it. */
export function SectionSearch({ vertical, label }: { vertical: Vertical; label: string }) {
  const [me, setMe] = useState<Me | null>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const [query, setQuery] = useState("")
  const [searched, setSearched] = useState("")
  const [results, setResults] = useState<SearchResults | null>(null)
  const [searching, setSearching] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [track, setTrack] = useState(false)
  const [fetched, setFetched] = useState<FetchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadTopics = () =>
    fetch(`${API_URL}/api/topics/?vertical=${vertical}`).then((r) => (r.ok ? r.json() : [])).then(setTopics).catch(() => {})

  useEffect(() => {
    authHeaders()
      .then((headers) => fetch(`${API_URL}/api/topics/me`, { headers }))
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ signed_in: false, is_admin: false }))
    fetch(`${API_URL}/api/topics/?vertical=${vertical}`).then((r) => (r.ok ? r.json() : [])).then(setTopics).catch(() => {})
  }, [vertical])

  const search = async (e?: React.FormEvent, term?: string) => {
    e?.preventDefault()
    const q = (term ?? query).trim()
    if (term) setQuery(term)
    if (q.length < 2) return
    setSearching(true)
    setError(null)
    setFetched(null)
    try {
      const res = await fetch(`${API_URL}/api/search/?q=${encodeURIComponent(q)}&vertical=${vertical}`)
      if (!res.ok) throw new Error(await errorText(res))
      setResults(await res.json())
      setSearched(q)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
    } finally {
      setSearching(false)
    }
  }

  const fetchNews = async () => {
    setFetching(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/api/topics/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ query: searched, vertical, track }),
      })
      if (!res.ok) throw new Error(await errorText(res))
      const result: FetchResult = await res.json()
      setFetched(result)
      if (result.corrected_from) {  // show the corrected name in the box from now on
        setQuery(result.topic.query)
        setSearched(result.topic.query)
      }
      void loadTopics()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't fetch news")
    } finally {
      setFetching(false)
    }
  }

  const setTopicActive = async (topic: Topic, active: boolean) => {
    const res = await fetch(`${API_URL}/api/topics/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ active }),
    })
    if (res.ok) void loadTopics()
    else setError(await errorText(res))
  }

  const tracked = topics.filter((t) => t.active)
  const people = results ? [...results.celebrities, ...results.brands] : []

  return (
    <section className="container mx-auto space-y-5 px-4 md:px-8">
      <form onSubmit={search} role="search" className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-full px-5 py-2.5 ring-1 ring-foreground/20 focus-within:ring-2 focus-within:ring-foreground">
          <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={80} aria-label={label}
            placeholder={`${label}: a celebrity, brand or style…`}
            className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
        </div>
        <button type="submit" disabled={searching || query.trim().length < 2}
          className="rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background disabled:opacity-40">
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {tracked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground"><Radio className="size-4" aria-hidden /> Tracking:</span>
          {tracked.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1">
              <button onClick={() => { setQuery(t.query); setSearched("") }} className="hover:underline">{t.query}</button>
              <span className="text-xs text-muted-foreground">· {t.total_articles}</span>
              {me?.is_admin && (
                <button onClick={() => setTopicActive(t, false)} aria-label={`Stop tracking ${t.query}`} className="ml-0.5 opacity-60 hover:opacity-100">
                  <X className="size-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">{error}</p>}

      {results && (
        <div className="space-y-6 rounded-2xl p-5 ring-1 ring-foreground/10 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <p className="text-sm text-muted-foreground">
              {results.articles.length} {results.articles.length === 1 ? "story" : "stories"} about “{searched}” already in TrendScope
              {results.trends.length > 0 && ` · ${results.trends.length} related trends`}
            </p>
            {/* Anyone can fetch (visitors are rate-limited by the API); only admins can keep tracking */}
            <div className="flex flex-wrap items-center gap-3">
              {me?.is_admin && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} className="size-4 accent-foreground" />
                  Keep tracking
                </label>
              )}
              <button onClick={fetchNews} disabled={fetching}
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 ring-foreground/20 hover:bg-muted disabled:opacity-50">
                <Download className="size-4" aria-hidden /> {fetching ? "Fetching latest news…" : `Fetch latest news about “${searched}”`}
              </button>
            </div>
          </div>

          {results.did_you_mean && !fetched && (
            <p className="text-sm">
              Did you mean{" "}
              <button onClick={() => search(undefined, results.did_you_mean!)} className="font-semibold underline underline-offset-2">
                {results.did_you_mean}
              </button>?
            </p>
          )}

          {fetched?.corrected_from && (
            <p className="text-sm text-muted-foreground">
              No news for “{fetched.corrected_from}”, so we searched for <strong className="text-foreground">{fetched.topic.query}</strong> instead.
            </p>
          )}

          {fetched?.suggestion && fetched.found === 0 && (
            <p className="text-sm">
              No recent news found. Try{" "}
              <button onClick={() => search(undefined, fetched.suggestion!)} className="font-semibold underline underline-offset-2">
                {fetched.suggestion}
              </button>?
            </p>
          )}

          {fetched?.cached && (
            <div className="rounded-xl bg-muted px-4 py-3 text-sm" role="status">
              “{fetched.topic.query}” was already fetched{fetched.topic.last_fetched_at ? <> <TimeAgo iso={fetched.topic.last_fetched_at} /></> : " recently"}, so
              here are its {fetched.found} saved stories. Fresh news is fetched again after a few hours.
            </div>
          )}

          {fetched && !fetched.cached && (
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-950" role="status">
              Found {fetched.found} recent stories: <strong>{fetched.new_articles} new</strong>
              {fetched.skipped_duplicates > 0 && `, ${fetched.skipped_duplicates} already in TrendScope`}.
              {fetched.new_articles > 0 && " AI is summarising them now; they'll appear in trends and celebrity pages within a few minutes."}
              {fetched.topic.active && ` Tracking “${fetched.topic.query}”: new stories are fetched every 15 minutes.`}
              {fetched.tracking_ignored && " (Only admins can turn on tracking.)"}
            </div>
          )}

          {people.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {people.map((p) => (
                <Link key={p.id} href={entityPath(p)} className="rounded-full px-3 py-1.5 text-sm ring-1 ring-foreground/15 hover:bg-muted">
                  {p.name} <span className="text-xs text-muted-foreground">· {p.kind}</span>
                </Link>
              ))}
            </div>
          )}

          <StoryList articles={fetched?.articles.length ? fetched.articles : results.articles}
            heading={fetched?.articles.length ? "Just fetched" : "Stories"} />
          {!fetched?.articles.length && results.articles.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing about “{searched}” in this section yet.</p>
          )}
        </div>
      )}
    </section>
  )
}

function StoryList({ articles, heading }: { articles: Article[]; heading: string }) {
  if (!articles.length) return null
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{heading}</h3>
      <ul className="divide-y">
        {articles.slice(0, 12).map((a) => (
          <li key={a.id} className="flex gap-3 py-3">
            {a.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- publisher images come from arbitrary hosts
              <img src={a.image_url} alt="" className="size-14 shrink-0 rounded-lg bg-muted object-cover" />
            ) : <div className="size-14 shrink-0 rounded-lg bg-muted" />}
            <div className={cn("min-w-0 space-y-0.5")}>
              <a href={a.url} target="_blank" rel="noreferrer" className="font-medium leading-snug hover:underline">
                {a.title} <ExternalLink className="inline size-3 text-muted-foreground" />
              </a>
              {a.ai_summary && <p className="line-clamp-2 text-sm text-muted-foreground">{a.ai_summary}</p>}
              <p className="text-xs text-muted-foreground">{a.source_name} · {timeAgo(a.published_at)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
