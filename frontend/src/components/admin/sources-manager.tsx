"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle, CheckCircle2, Download, ExternalLink, FlaskConical, Pencil, Plus,
  RefreshCw, Trash2, X, XCircle, Circle,
} from "lucide-react"
import { cn } from "cn"
import { AdminRequired } from "./admin-required"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  api, API_URL, needsAdmin, SOURCE_CATEGORIES,
  type AdminOverview, type FeedTestResult, type Source, type SourceInput, type SourceStatus,
} from "@/lib/api"

const EMPTY_FORM: SourceInput = {
  name: "", url: "", feed_url: "", category: "fashion", country: "", language: "en", active: true,
}

const STATUS_STYLES: Record<SourceStatus, { label: string; className: string; Icon: typeof Circle }> = {
  healthy: { label: "Healthy", className: "text-emerald-600", Icon: CheckCircle2 },
  warning: { label: "Warning", className: "text-amber-600", Icon: AlertTriangle },
  error: { label: "Error", className: "text-red-600", Icon: XCircle },
  never: { label: "Not collected", className: "text-muted-foreground", Icon: Circle },
}

function timeAgo(iso: string | null) {
  if (!iso) return "Never"
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return "Just now"
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

type Notice = { kind: "success" | "error"; text: string } | null

export function SourcesManager() {
  const [sources, setSources] = useState<Source[]>([])
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adminOnly, setAdminOnly] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState<Record<string, string>>({}) // source id -> action in progress

  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string>("all")

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Source | null>(null)
  const [form, setForm] = useState<SourceInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [testResult, setTestResult] = useState<{ name: string; result: FeedTestResult } | null>(null)

  const applyData = useCallback(([list, stats]: [Source[], AdminOverview]) => {
    setSources(list)
    setOverview(stats)
    setLoadError(null)
    setLoading(false)
  }, [])

  const applyError = useCallback((err: unknown) => {
    setLoadError(err instanceof Error ? err.message : "Could not reach the API")
    setAdminOnly(needsAdmin(err))
    setLoading(false)
  }, [])

  const refresh = useCallback(
    () => Promise.all([api.listSources(), api.overview()]).then(applyData, applyError),
    [applyData, applyError],
  )

  useEffect(() => {
    Promise.all([api.listSources(), api.overview()]).then(applyData, applyError)
  }, [applyData, applyError])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sources.filter(
      (s) =>
        (category === "all" || s.category === category) &&
        (!q || s.name.toLowerCase().includes(q) || s.feed_url.toLowerCase().includes(q)),
    )
  }, [sources, query, category])

  const runAction = async (id: string, action: string, fn: () => Promise<void>) => {
    setBusy((b) => ({ ...b, [id]: action }))
    try {
      await fn()
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Something went wrong" })
    } finally {
      setBusy((b) => {
        const next = { ...b }
        delete next[id]
        return next
      })
    }
  }

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  const openEdit = (source: Source) => {
    setEditing(source)
    setForm({
      name: source.name,
      url: source.url,
      feed_url: source.feed_url,
      category: source.category ?? "other",
      country: source.country ?? "",
      language: source.language,
      active: source.active,
    })
    setFormOpen(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...form, country: form.country?.trim() || null }
      if (editing) {
        await api.updateSource(editing.id, payload)
        setNotice({ kind: "success", text: `Updated ${form.name}` })
      } else {
        await api.createSource(payload)
        setNotice({ kind: "success", text: `Added ${form.name}` })
      }
      setFormOpen(false)
      await refresh()
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not save source" })
    } finally {
      setSaving(false)
    }
  }

  const testFeed = (id: string, name: string, feedUrl: string) =>
    runAction(id, "test", async () => {
      const result = await api.testFeed(feedUrl)
      setTestResult({ name, result })
    })

  const collect = (source: Source) =>
    runAction(source.id, "collect", async () => {
      const result = await api.collectSource(source.id)
      setNotice(
        result.error
          ? { kind: "error", text: `${source.name}: ${result.error}` }
          : { kind: "success", text: `${source.name}: ${result.new_articles} new, ${result.skipped_duplicates} duplicates skipped` },
      )
      await refresh()
    })

  const toggleActive = (source: Source) =>
    runAction(source.id, "toggle", async () => {
      await api.updateSource(source.id, { active: !source.active })
      await refresh()
    })

  const remove = (source: Source) => {
    if (!confirm(`Delete "${source.name}"? This also deletes its ${source.article_count} collected articles.`)) return
    runAction(source.id, "delete", async () => {
      await api.deleteSource(source.id)
      setNotice({ kind: "success", text: `Deleted ${source.name}` })
      await refresh()
    })
  }

  const collectAll = () =>
    runAction("all", "collect", async () => {
      const { queued } = await api.collectAll()
      setNotice({ kind: "success", text: `Collecting ${queued} active sources in the background. Refresh in a moment.` })
    })

  if (loadError && adminOnly) return <AdminRequired message={loadError} />

  if (loadError && !sources.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="size-5" /> Cannot reach the TrendScope API
          </CardTitle>
          <CardDescription>
            Tried {API_URL}: {loadError}. Make sure the backend is running:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="rounded-lg bg-muted p-3 text-xs overflow-x-auto">
            cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000
          </pre>
          <Button onClick={() => { setLoading(true); refresh() }}>
            <RefreshCw /> Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const statusCount = (s: SourceStatus) => overview?.sources_by_status[s] ?? 0

  return (
    <div className="space-y-6">
      {/* Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active sources" value={overview ? `${overview.sources_active} / ${overview.sources_total}` : "–"} />
        <StatCard
          label="Source health"
          value={overview ? `${statusCount("healthy")} healthy` : "–"}
          hint={overview ? `${statusCount("warning")} warning · ${statusCount("error")} error` : undefined}
        />
        <StatCard
          label="Articles collected"
          value={overview?.articles_total.toLocaleString() ?? "–"}
          hint={overview ? `${overview.articles_last_24h.toLocaleString()} in last 24h` : undefined}
        />
        <StatCard label="Waiting for AI" value={overview?.articles_pending_ai.toLocaleString() ?? "–"} hint="Processed in Week 3" />
      </div>

      {notice && (
        <div
          role="status"
          className={cn(
            "flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm",
            notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900",
          )}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0 opacity-60 hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Add / edit form */}
      {formOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">{editing ? `Edit ${editing.name}` : "Add a source"}</CardTitle>
            <CardDescription>Only add publisher-provided RSS feeds or sources you have permission to use.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitForm} className="grid gap-4 md:grid-cols-2">
              <Field label="Name" id="name">
                <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vogue" />
              </Field>
              <Field label="Category" id="category">
                <select
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as SourceInput["category"] })}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm capitalize outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {SOURCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Website URL" id="url">
                <Input id="url" type="url" required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://www.vogue.com" />
              </Field>
              <Field label="Feed URL" id="feed_url">
                <div className="flex gap-2">
                  <Input id="feed_url" type="url" required value={form.feed_url} onChange={(e) => setForm({ ...form, feed_url: e.target.value })} placeholder="https://www.vogue.com/feed/rss" />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!form.feed_url || busy.form === "test"}
                    onClick={() => testFeed("form", form.name || "New source", form.feed_url)}
                  >
                    <FlaskConical /> {busy.form === "test" ? "Testing…" : "Test"}
                  </Button>
                </div>
              </Field>
              <Field label="Country (optional)" id="country">
                <Input id="country" value={form.country ?? ""} maxLength={2} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} placeholder="US" />
              </Field>
              <Field label="Language" id="language">
                <Input id="language" required value={form.language} maxLength={5} onChange={(e) => setForm({ ...form, language: e.target.value.toLowerCase() })} placeholder="en" />
              </Field>
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="size-4 accent-foreground" />
                Active (include in scheduled collection)
              </label>
              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add source"}</Button>
                <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Feed test result */}
      {testResult && (
        <Card size="sm">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {testResult.result.ok
                    ? <CheckCircle2 className="size-4 text-emerald-600" />
                    : <XCircle className="size-4 text-red-600" />}
                  Feed test: {testResult.name}
                </CardTitle>
                <CardDescription>
                  {testResult.result.ok
                    ? `${testResult.result.feed_title ?? "Feed"} returned ${testResult.result.entry_count} entries. Nothing was saved.`
                    : testResult.result.error}
                </CardDescription>
              </div>
              <button onClick={() => setTestResult(null)} aria-label="Close test result" className="opacity-60 hover:opacity-100">
                <X className="size-4" />
              </button>
            </div>
          </CardHeader>
          {testResult.result.sample.length > 0 && (
            <CardContent>
              <ul className="divide-y">
                {testResult.result.sample.map((item) => (
                  <li key={item.url} className="flex items-center gap-3 py-2">
                    {item.image_url
                      // Feed images come from arbitrary publisher hosts, so next/image isn't configured for them
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={item.image_url} alt="" className="size-10 shrink-0 rounded object-cover bg-muted" />
                      : <div className="size-10 shrink-0 rounded bg-muted" />}
                    <a href={item.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">{item.title}</a>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.published_at)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Search sources…" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:w-64" />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Filter by category"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm capitalize outline-none"
          >
            <option value="all">All categories</option>
            {SOURCE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={refresh} aria-label="Refresh"><RefreshCw /> Refresh</Button>
          <Button variant="outline" onClick={collectAll} disabled={!!busy.all}>
            <Download /> {busy.all ? "Starting…" : "Collect all now"}
          </Button>
          <Button onClick={openCreate}><Plus /> Add source</Button>
        </div>
      </div>

      {/* Sources table */}
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Articles</th>
              <th className="px-4 py-3 font-medium">Last collected</th>
              <th className="px-4 py-3 font-medium">Active</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Loading sources…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No sources match.</td></tr>
            )}
            {filtered.map((source) => {
              const status = STATUS_STYLES[source.last_status ?? "never"] ?? STATUS_STYLES.never
              const action = busy[source.id]
              return (
                <tr key={source.id} className={cn("align-top", !source.active && "opacity-60")}>
                  <td className="px-4 py-3 max-w-[320px]">
                    <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
                      {source.name} <ExternalLink className="size-3 text-muted-foreground" />
                    </a>
                    <div className="truncate text-xs text-muted-foreground" title={source.feed_url}>{source.feed_url}</div>
                    {source.last_error && (
                      <div className="mt-1 text-xs text-red-600">
                        {source.last_error}
                        {source.consecutive_failures > 1 && ` (failed ${source.consecutive_failures}× in a row)`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="capitalize">{source.category ?? "other"}</Badge>
                    {source.country && <span className="ml-2 text-xs text-muted-foreground">{source.country}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-flex items-center gap-1.5", status.className)}>
                      <status.Icon className="size-4" /> {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {source.article_count.toLocaleString()}
                    {!!source.last_new_articles && (
                      <div className="text-xs text-emerald-600">+{source.last_new_articles} last run</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" title={source.last_collected_at ?? undefined}>
                    {timeAgo(source.last_collected_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      role="switch"
                      aria-checked={source.active}
                      aria-label={`${source.active ? "Disable" : "Enable"} ${source.name}`}
                      disabled={!!action}
                      onClick={() => toggleActive(source)}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
                        source.active ? "bg-foreground" : "bg-muted-foreground/30",
                      )}
                    >
                      <span className={cn("inline-block size-4 rounded-full bg-background shadow transition-transform", source.active ? "translate-x-4.5" : "translate-x-0.5")} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" disabled={!!action} onClick={() => testFeed(source.id, source.name, source.feed_url)}>
                        <FlaskConical /> {action === "test" ? "Testing…" : "Test"}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={!!action} onClick={() => collect(source)}>
                        <Download /> {action === "collect" ? "Collecting…" : "Collect"}
                      </Button>
                      <Button size="icon-sm" variant="ghost" disabled={!!action} onClick={() => openEdit(source)} aria-label={`Edit ${source.name}`}>
                        <Pencil />
                      </Button>
                      <Button size="icon-sm" variant="ghost" disabled={!!action} onClick={() => remove(source)} aria-label={`Delete ${source.name}`} className="text-red-600 hover:text-red-700">
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
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

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}
