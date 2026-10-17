import { TimeAgo } from "@/components/trends/time-ago"
import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, Sparkles } from "lucide-react"
import { cn } from "cn"
import { StatusBadge } from "@/components/trends/status-badge"
import { SectionHeader } from "@/components/ui/section-header"
import { ForecastPanel } from "@/components/trends/forecast-panel"
import { MentionsChart, ScoreHistoryChart, SearchInterestChart } from "@/components/trends/trend-charts"
import {
  COMPONENT_LABELS, COMPONENT_WEIGHTS, formatGrowth, getJSON, STATUS_STYLES,
  type NamedCount, type SearchInterest, type TrendDetail, type TrendStatus,
} from "@/lib/trends"

export const metadata: Metadata = { title: "Trend" }

export default function TrendPage({ params }: PageProps<"/trends/[slug]">) {
  return (
    <div className="container mx-auto px-4 md:px-8 py-10">
      <Link href="/trending" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All trends
      </Link>
      <Suspense fallback={<TrendSkeleton />}>
        {params.then(({ slug }) => <TrendContent slug={slug} />)}
      </Suspense>
    </div>
  )
}

async function TrendContent({ slug }: { slug: string }) {
  const trend = await getJSON<TrendDetail>(`/api/trends/${encodeURIComponent(slug)}`)
  if (!trend) notFound()

  const stats = trend.stats
  const ai = trend.explanation
  const aliases = trend.aliases.filter((a) => a !== trend.name)

  return (
    <div className="mt-6 space-y-12">
      {/* Hero */}
      <header className="grid gap-8 border-b border-foreground/10 pb-10 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-3">
          <p className="eyebrow text-muted-foreground">
            {[trend.type, trend.category].filter(Boolean).join(" · ")}
          </p>
          <h1 className="font-serif text-4xl font-bold tracking-tight md:text-6xl">{trend.name}</h1>
          {aliases.length > 0 && (
            <p className="text-sm text-muted-foreground">Also written as: {aliases.slice(0, 6).join(", ")}</p>
          )}
        </div>
        <div className="flex items-end gap-8">
          <div>
            <p className="eyebrow text-muted-foreground">Trend score</p>
            <p className="font-serif text-6xl font-bold tabular-nums leading-none">
              {Math.round(trend.trend_score)}<span className="text-2xl text-muted-foreground">/100</span>
            </p>
          </div>
          <div className="space-y-2 pb-1">
            <StatusBadge status={trend.status} size="lg" />
            <p className="text-sm font-medium tabular-nums">{formatGrowth(trend.growth_pct, trend.status)} share of voice</p>
          </div>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="space-y-12 min-w-0">
          {/* Why is this trending */}
          <section className="rounded-2xl bg-muted/40 p-6 ring-1 ring-foreground/10 md:p-8">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
              <Sparkles className="size-4" /> Why is this trending?
            </h2>
            {ai?.why_trending && <p className="mt-4 font-serif text-xl leading-relaxed md:text-2xl md:leading-relaxed">{ai.why_trending}</p>}
            {stats && (
              <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Fact label={`Stories, last ${stats.window_days} days`} value={stats.mentions_current} />
                <Fact label="Publications (30d)" value={stats.sources_30d} />
                <Fact label="Celebrities linked" value={stats.celebrities.length} />
                <Fact label="Brands & designers" value={stats.brands.length} />
              </dl>
            )}
            {ai && (
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <Bullets title="Drivers" items={ai.drivers} />
                <Bullets title="Risks" items={ai.risks} />
              </div>
            )}
            <p className="mt-6 text-xs text-muted-foreground">
              {ai
                ? <>AI analysis · confidence {Math.round(ai.confidence * 100)}% · updated <TimeAgo iso={trend.explanation_updated_at} /></>
                : trend.explanation_pending
                  ? "The AI analysis for this trend is being written now. Refresh in a few seconds to see it."
                  : "This trend has no active signal, so it has no AI analysis."}
            </p>
          </section>

          {/* Momentum */}
          <section className="space-y-4">
            <SectionTitle title="Trend momentum" subtitle="Distinct stories per day, last 30 days" />
            <MentionsChart data={trend.timeline} />
            {trend.score_history.length > 1 && (
              <>
                <SectionTitle title="Score history" subtitle="Daily trend score; hover to see its lifecycle stage on each day" />
                <ScoreHistoryChart data={trend.score_history} />
              </>
            )}
            <GoogleSearches search={trend.search_interest} />
          </section>

          {/* Forecast: statistical projection always, AI outlook when generated */}
          <section className="space-y-6">
            <SectionTitle title="Where is this trend going?" />
            <Lifecycle current={trend.status ?? "emerging"} />
            <ForecastPanel forecast={trend.forecast} score={trend.trend_score} />
            {ai && (
              <div className="grid gap-6 sm:grid-cols-2">
                <Outlook title="Short term (AI)" text={ai.short_term_outlook} />
                <Outlook title="Long term (AI)" text={ai.long_term_outlook} />
              </div>
            )}
          </section>

          {/* Coverage */}
          <section className="space-y-4">
            <SectionTitle title="Coverage" subtitle="Stories mentioning this trend" />
            <ul className="divide-y rounded-xl shadow-soft ring-1 ring-foreground/10">
              {trend.articles.map((a) => (
                <li key={a.id} className="flex gap-4 p-4">
                  {a.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- publisher images come from arbitrary hosts
                    <img src={a.image_url} alt="" className="size-16 shrink-0 rounded-lg bg-muted object-cover" />
                  ) : <div className="size-16 shrink-0 rounded-lg bg-muted" />}
                  <div className="min-w-0 space-y-1">
                    <a href={a.url} target="_blank" rel="noreferrer" className="font-medium leading-snug hover:underline">
                      {a.title} <ExternalLink className="inline size-3 text-muted-foreground" />
                    </a>
                    {a.ai_summary && <p className="line-clamp-2 text-sm text-muted-foreground">{a.ai_summary}</p>}
                    <p className="text-xs text-muted-foreground">{a.source_name} · <TimeAgo iso={a.published_at} /></p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-10">
          <section className="space-y-4">
            <SectionTitle title="Score breakdown" />
            <ScoreBreakdown breakdown={trend.score_breakdown ?? {}} />
          </section>
          <RankedList title="Celebrity signal" items={trend.celebrities} empty="No celebrities linked yet" />
          <RankedList title="Brand adoption" items={trend.brands} empty="No brands linked yet" />
          <RankedList title="Sources" items={trend.sources} empty="" />
          {trend.related.length > 0 && (
            <section className="space-y-3">
              <SectionTitle title="Related trends" />
              <div className="flex flex-wrap gap-2">
                {trend.related.map((r) => (
                  <Link key={r.slug} href={`/trends/${r.slug}`}
                    className="rounded-full px-3 py-1 text-sm ring-1 ring-foreground/15 transition-colors duration-200 hover:bg-muted">
                    {r.name}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <SectionHeader title={title} subtitle={subtitle} size="md" />
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-serif text-3xl font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  )
}

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <h3 className="eyebrow text-muted-foreground">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
        {items.map((d) => <li key={d}>{d}</li>)}
      </ul>
    </div>
  )
}

function Outlook({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl p-5 ring-1 ring-foreground/10">
      <h3 className="eyebrow text-muted-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed">{text}</p>
    </div>
  )
}

const STAGES: TrendStatus[] = ["emerging", "rising", "trending", "peak", "declining"]

function Lifecycle({ current }: { current: TrendStatus }) {
  const index = STAGES.indexOf(current)
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label={`Lifecycle stage: ${STATUS_STYLES[current].label}`}>
      {STAGES.map((stage, i) => (
        <li key={stage} className="space-y-2">
          <div className={cn("h-1.5 rounded-full", i <= index ? "bg-foreground" : "bg-muted")} />
          <p className={cn("text-xs", i === index ? "font-bold" : "text-muted-foreground")}>{STATUS_STYLES[stage].label}</p>
        </li>
      ))}
    </ol>
  )
}

function GoogleSearches({ search }: { search: SearchInterest | null }) {
  if (!search) {
    return (
      <p className="text-sm text-muted-foreground">
        Google search interest hasn&apos;t been checked for this trend yet. The busiest trends are checked first.
      </p>
    )
  }
  const growth = search.growth_pct
  return (
    <>
      <SectionTitle
        title="Google searches"
        subtitle={`Search interest for "${search.keyword}"${search.geo ? ` in ${search.geo}` : " worldwide"}, last 90 days. 100 is its busiest day.`}
      />
      {search.has_data && search.series.length > 1 ? (
        <>
          <SearchInterestChart data={search.series} />
          <p className="text-sm">
            {growth === null
              ? "Searches have only just started."
              : Math.abs(growth) < 1
                ? "Searches have been flat over the last 4 weeks, compared with the 4 weeks before."
                : <>Searches are <strong className="tabular-nums">{growth >= 0 ? "up" : "down"} {Math.abs(Math.round(growth))}%</strong> over the last 4 weeks, compared with the 4 weeks before.</>}
            <span className="text-muted-foreground"> Checked <TimeAgo iso={search.fetched_at} />.</span>
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Too few people search Google for this name for it to be measured. Checked <TimeAgo iso={search.fetched_at} />.
        </p>
      )}
    </>
  )
}

function ScoreBreakdown({ breakdown }: { breakdown: Record<string, number | null> }) {
  return (
    <ul className="space-y-3">
      {Object.keys(COMPONENT_WEIGHTS).map((key) => {
        const value = breakdown[key]
        return (
          <li key={key} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>{COMPONENT_LABELS[key]} <span className="text-xs text-muted-foreground">{COMPONENT_WEIGHTS[key]}%</span></span>
              <span className="tabular-nums text-muted-foreground">{value === null || value === undefined ? "No data yet" : Math.round(value)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-foreground" style={{ width: `${value ?? 0}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function RankedList({ title, items, empty }: { title: string; items: NamedCount[]; empty: string }) {
  if (!items.length && !empty) return null
  const max = Math.max(...items.map((i) => i.count), 1)
  return (
    <section className="space-y-3">
      <SectionTitle title={title} />
      {items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <ul className="space-y-2">
          {items.slice(0, 6).map((item) => (
            <li key={item.name} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-sm">
              <span className="truncate">{item.name}</span>
              <span className="tabular-nums text-muted-foreground">{item.count}</span>
              <div className="col-span-2 h-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-foreground/70" style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TrendSkeleton() {
  return (
    <div className="mt-6 animate-pulse space-y-6" aria-label="Loading trend">
      <div className="h-4 w-40 rounded bg-muted" />
      <div className="h-14 w-2/3 rounded bg-muted" />
      <div className="h-48 rounded-2xl bg-muted" />
    </div>
  )
}
