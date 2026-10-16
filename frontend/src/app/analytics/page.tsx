import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { HistoryCompare } from "@/components/analytics/history-compare"
import { LifecycleBars } from "@/components/analytics/lifecycle-bars"
import { StatusBadge } from "@/components/trends/status-badge"
import { ApiUnavailable, TrendGridSkeleton } from "@/components/trends/trend-grid"
import { getJSON, type AnalyticsOverview, type Mover } from "@/lib/trends"

export const metadata: Metadata = { title: "Analytics" }

const TYPE_LABELS: Record<string, string> = {
  color: "Rising colors", clothing: "Clothing", fabric: "Fabrics", footwear: "Footwear",
  accessory: "Accessories", aesthetic: "Aesthetics", makeup: "Beauty", jewelry: "Jewelry",
}

export default function AnalyticsPage() {
  return (
    <div className="container mx-auto space-y-12 px-4 py-12 md:px-8">
      <header className="max-w-2xl space-y-2">
        <p className="eyebrow text-muted-foreground">Intelligence</p>
        <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">Analytics</h1>
        <p className="text-muted-foreground">How trends are moving: lifecycle, momentum over time, and this week&apos;s biggest movers.</p>
      </header>
      <Suspense fallback={<TrendGridSkeleton count={4} />}>
        <AnalyticsContent />
      </Suspense>
    </div>
  )
}

async function AnalyticsContent() {
  const data = await getJSON<AnalyticsOverview>("/api/analytics/overview")
  if (!data) return <ApiUnavailable />

  return (
    <div className="space-y-14">
      <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
        <section className="space-y-6">
          <dl className="grid grid-cols-2 gap-6">
            <Stat label="Active trends" value={data.active_trends} />
            <Stat label="New this week" value={data.new_this_week} />
          </dl>
          <div className="space-y-3">
            <h2 className="font-serif text-xl font-semibold">Lifecycle</h2>
            <LifecycleBars counts={data.lifecycle} />
          </div>
        </section>
        <section className="min-w-0 space-y-3">
          <div>
            <h2 className="font-serif text-2xl font-semibold tracking-tight">Momentum: today&apos;s top trends</h2>
            <p className="text-sm text-muted-foreground">Daily trend score since these trends were first detected (up to 30 days). Hover for each day&apos;s lifecycle stage.</p>
          </div>
          <HistoryCompare series={data.history_series} data={data.history} />
        </section>
      </div>

      <div className="grid gap-10 md:grid-cols-2">
        <MoverTable title="Biggest risers" subtitle="Score change vs 7 days ago" movers={data.risers} up />
        <MoverTable title="Cooling fastest" subtitle="Score change vs 7 days ago" movers={data.fallers} />
      </div>

      <section className="space-y-5">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Leaders by category</h2>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(data.type_leaders).filter(([, list]) => list.length).map(([type, list]) => (
            <div key={type} className="space-y-2">
              <h3 className="eyebrow text-muted-foreground">{TYPE_LABELS[type] ?? type}</h3>
              <ol className="space-y-1.5">
                {list.map((t, i) => (
                  <li key={t.slug} className="flex items-baseline justify-between gap-3 text-sm">
                    <Link href={`/trends/${t.slug}`} className="truncate hover:underline">
                      <span className="mr-2 tabular-nums text-muted-foreground">{i + 1}</span>{t.name}
                    </Link>
                    <span className="tabular-nums text-muted-foreground">{Math.round(t.trend_score)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-serif text-4xl font-bold tabular-nums">{value}</dd>
    </div>
  )
}

function MoverTable({ title, subtitle, movers, up = false }: { title: string; subtitle: string; movers: Mover[]; up?: boolean }) {
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-serif text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {movers.length === 0 ? <p className="text-sm text-muted-foreground">Not enough history yet.</p> : (
        <ul className="divide-y rounded-xl shadow-soft ring-1 ring-foreground/10">
          {movers.map((m) => (
            <li key={m.slug} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Link href={`/trends/${m.slug}`} className="truncate font-medium hover:underline">{m.name}</Link>
                <StatusBadge status={m.status} className="hidden sm:inline-flex" />
              </div>
              <span className="flex shrink-0 items-center gap-1 text-sm tabular-nums">
                <Icon className="size-4" aria-hidden />
                {m.change > 0 ? "+" : ""}{Math.round(m.change)}
                <span className="text-muted-foreground">
                  {m.was === null ? " (new)" : ` (${Math.round(m.was)} → ${Math.round(m.trend_score)})`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
