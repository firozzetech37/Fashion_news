"use client"

import { useCallback, useEffect, useState } from "react"
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Copy, ExternalLink, Play, RefreshCw, RotateCcw, Sparkles, X, XCircle,
} from "lucide-react"
import { cn } from "cn"
import { AdminRequired } from "./admin-required"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { aiApi, API_URL, needsAdmin, type AIPipeline, type Article, type TrendDirection } from "@/lib/api"

const REFRESH_MS = 10_000

const DIRECTION: Record<TrendDirection, { Icon: typeof ArrowUpRight; className: string }> = {
  emerging: { Icon: Sparkles, className: "text-violet-700 bg-violet-50 ring-violet-200" },
  rising: { Icon: ArrowUpRight, className: "text-emerald-700 bg-emerald-50 ring-emerald-200" },
  stable: { Icon: ArrowRight, className: "text-slate-700 bg-slate-50 ring-slate-200" },
  declining: { Icon: ArrowDownRight, className: "text-amber-700 bg-amber-50 ring-amber-200" },
}

function timeAgo(iso: string | null) {
  if (!iso) return "–"
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`
}

type Notice = { kind: "success" | "error"; text: string } | null

export function AIPipelineDashboard() {
  const [data, setData] = useState<AIPipeline | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adminOnly, setAdminOnly] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const applyData = useCallback((d: AIPipeline) => {
    setData(d)
    setLoadError(null)
  }, [])
  const applyError = useCallback((err: unknown) => {
    setLoadError(err instanceof Error ? err.message : "Could not reach the API")
    setAdminOnly(needsAdmin(err))
  }, [])
  const refresh = useCallback(() => aiApi.pipeline().then(applyData, applyError), [applyData, applyError])

  // Poll so the queue numbers move while the worker runs
  useEffect(() => {
    aiApi.pipeline().then(applyData, applyError)
    const timer = setInterval(() => aiApi.pipeline().then(applyData, applyError), REFRESH_MS)
    return () => clearInterval(timer)
  }, [applyData, applyError])

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key)
    try {
      setNotice({ kind: "success", text: await fn() })
      await refresh()
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Something went wrong" })
    } finally {
      setBusy(null)
    }
  }

  const processNow = () =>
    run("process", async () => {
      const { queued } = await aiApi.processNow(25)
      return `Processing up to ${queued} articles in the background. Numbers update every few seconds.`
    })

  const retryFailed = () =>
    run("retry", async () => {
      const { requeued } = await aiApi.retryFailed()
      return requeued ? `Re-queued ${requeued} failed articles.` : "No failed articles to retry."
    })

  const reprocess = (article: Article) =>
    run(article.id, async () => {
      const result = await aiApi.reprocess(article.id)
      return result.status === "processed"
        ? `Reprocessed "${article.title.slice(0, 60)}"`
        : `Still failing: ${result.ai_error ?? "unknown error"}`
    })

  if (loadError && adminOnly) return <AdminRequired message={loadError} />

  if (loadError && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="size-5" /> Cannot reach the TrendScope API
          </CardTitle>
          <CardDescription>Tried {API_URL}: {loadError}. Make sure the backend is running.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={refresh}><RefreshCw /> Retry</Button>
        </CardContent>
      </Card>
    )
  }

  if (!data) return <p className="text-muted-foreground">Loading pipeline…</p>

  const s = data.by_status
  const total = s.pending + s.processing + s.processed + s.failed
  const pct = (n: number) => (total ? (n / total) * 100 : 0)

  return (
    <div className="space-y-8">
      {/* Queue progress */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle className="font-serif text-xl">Processing queue</CardTitle>
              <CardDescription>
                {s.processed.toLocaleString()} of {total.toLocaleString()} articles processed · model{" "}
                <code className="text-xs">{data.model}</code> · embeddings <code className="text-xs">{data.embedding_model}</code>
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={refresh}><RefreshCw /> Refresh</Button>
              <Button variant="outline" onClick={retryFailed} disabled={busy === "retry" || !s.failed}>
                <RotateCcw /> Retry failed
              </Button>
              <Button onClick={processNow} disabled={busy === "process" || !s.pending}>
                <Play /> {busy === "process" ? "Starting…" : "Process 25 now"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img"
            aria-label={`${s.processed} processed, ${s.processing} processing, ${s.pending} pending, ${s.failed} failed`}>
            <div className="bg-emerald-500 transition-all" style={{ width: `${pct(s.processed)}%` }} />
            <div className="bg-sky-400 transition-all" style={{ width: `${pct(s.processing)}%` }} />
            <div className="bg-red-500 transition-all" style={{ width: `${pct(s.failed)}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <Legend color="bg-emerald-500" label="Processed" value={s.processed} />
            <Legend color="bg-sky-400" label="Processing" value={s.processing} />
            <Legend color="bg-muted-foreground/30" label="Queued" value={s.pending} />
            <Legend color="bg-red-500" label="Failed" value={s.failed} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Processed (24h)" value={data.processed_last_24h.toLocaleString()} />
        <Stat
          label="Success rate"
          value={data.success_rate === null ? "–" : `${(data.success_rate * 100).toFixed(1)}%`}
          hint={`${data.failed_permanently} failed after ${data.max_attempts} attempts`}
        />
        <Stat label="With fashion trends" value={data.with_trends.toLocaleString()}
          hint={s.processed ? `${Math.round((data.with_trends / s.processed) * 100)}% of processed` : undefined} />
        <Stat label="Duplicate stories" value={data.duplicates.toLocaleString()} hint="Same story, different source" />
      </div>

      {notice && (
        <div role="status" className={cn(
          "flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm",
          notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900",
        )}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Failures */}
      {data.recent_failures.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-2xl font-bold">Failures</h2>
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Article</th>
                  <th className="px-4 py-3 font-medium">Error</th>
                  <th className="px-4 py-3 font-medium">Attempts</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.recent_failures.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="px-4 py-3 max-w-[320px]">
                      <div className="truncate font-medium">{a.title}</div>
                      <div className="text-xs text-muted-foreground">{a.source_name}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-red-700">{a.ai_error}</td>
                    <td className="px-4 py-3 tabular-nums">{a.ai_attempts} / {data.max_attempts}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => reprocess(a)}>
                        <RotateCcw /> {busy === a.id ? "Retrying…" : "Retry"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Latest results */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-2xl font-bold">Latest intelligence</h2>
          <span className="text-sm text-muted-foreground">Most recently processed</span>
        </div>
        {data.recent_processed.length === 0 ? (
          <p className="text-muted-foreground">Nothing processed yet.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.recent_processed.map((a) => (
              <ArticleResult key={a.id} article={a} busy={busy === a.id} onReprocess={() => reprocess(a)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function ArticleResult({ article: a, busy, onReprocess }: { article: Article; busy: boolean; onReprocess: () => void }) {
  const people = [...(a.entities?.celebrities ?? []), ...(a.entities?.designers ?? [])]
  const brands = a.entities?.brands ?? []
  const relevance = a.fashion_relevance ?? 0
  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="capitalize">{a.category ?? "other"}</Badge>
          <span>{a.source_name}</span>
          <span>·</span>
          <span>{timeAgo(a.ai_processed_at)}</span>
          {a.sentiment && <span className="capitalize">· {a.sentiment}</span>}
          {a.duplicate_of_id && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 ring-1 ring-amber-200">
              <Copy className="size-3" /> Duplicate story
            </span>
          )}
        </div>

        <a href={a.url} target="_blank" rel="noreferrer" className="group block">
          <h3 className="font-serif text-lg font-semibold leading-snug group-hover:underline">
            {a.title} <ExternalLink className="inline size-3.5 text-muted-foreground" />
          </h3>
        </a>
        {a.ai_summary && <p className="text-sm text-muted-foreground">{a.ai_summary}</p>}

        {!!a.ai_trends?.length && (
          <div className="flex flex-wrap gap-1.5">
            {a.ai_trends.map((t) => {
              const d = DIRECTION[t.direction] ?? DIRECTION.stable
              return (
                <span key={t.name} title={t.evidence}
                  className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1", d.className)}>
                  <d.Icon className="size-3" /> {t.name}
                  <span className="opacity-60">· {t.type} · {Math.round(t.confidence * 100)}%</span>
                </span>
              )
            })}
          </div>
        )}

        {(people.length > 0 || brands.length > 0) && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {people.length > 0 && (<><dt className="text-muted-foreground">People</dt><dd>{people.slice(0, 6).join(", ")}</dd></>)}
            {brands.length > 0 && (<><dt className="text-muted-foreground">Brands</dt><dd>{brands.slice(0, 6).join(", ")}</dd></>)}
          </dl>
        )}

        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Fashion relevance</span>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-foreground" style={{ width: `${relevance * 100}%` }} />
            </div>
            <span className="tabular-nums">{Math.round(relevance * 100)}%</span>
          </div>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onReprocess}>
            <RotateCcw /> {busy ? "Running…" : "Reprocess"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="font-serif text-2xl font-bold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("size-2.5 rounded-full", color)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value.toLocaleString()}</span>
    </span>
  )
}
