import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { CalendarClock, Scale, ShieldCheck } from "lucide-react"
import { cn } from "cn"
import {
  CONFIDENCE_NAMES, LABEL_ORDER, RateBar, RecentChecks, Stat, formatDate, pct,
} from "@/components/trends/forecast-accuracy"
import { ApiUnavailable } from "@/components/trends/trend-grid"
import { FORECAST_LABELS, getJSON, type AccuracySummary, type TrackRecord } from "@/lib/trends"

export const metadata: Metadata = {
  title: "Track Record",
  description: "Every TrendScope forecast is saved when it's made and checked a week later. Hit rates, open predictions and the rules.",
}

export default function TrackRecordPage() {
  return (
    <div className="container mx-auto space-y-12 px-4 py-12 md:px-8">
      <header className="max-w-3xl space-y-3">
        <p className="eyebrow text-muted-foreground">Intelligence</p>
        <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">Track record</h1>
        <p className="text-lg text-muted-foreground">
          A forecast is only worth something if you can check it. Every TrendScope forecast is saved the day it&apos;s made,
          then compared with the real score a week later, hits and misses alike. Nothing is edited after the fact.
        </p>
      </header>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
        <Record />
      </Suspense>
    </div>
  )
}

async function Record() {
  const data = await getJSON<TrackRecord>("/api/forecast/track-record")
  if (!data) return <ApiUnavailable />
  const { live, backtest, on_record } = data
  const hasLive = live.checked > 0
  const shown = hasLive ? live : backtest
  const beatsNaive = shown.projection_mae !== null && shown.naive_mae !== null ? shown.projection_mae < shown.naive_mae : null

  return (
    <div className="space-y-14">
      {/* Headline numbers */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Predictions on record" value={on_record.predictions.toLocaleString()}
          note={on_record.since ? `${on_record.trends} trends, since ${formatDate(on_record.since)}` : "none recorded yet"} />
        <Stat label="Checked so far" value={String(live.checked)}
          note={live.pending ? `${live.pending} waiting for their ${data.horizon_days}-day check` : "live forecasts"} />
        <Stat label="Live hit rate" value={hasLive ? pct(live.hit_rate) : "–"}
          note={hasLive ? `${live.hits} of ${live.checked} came true` : live.next_check_on ? `first results on ${formatDate(live.next_check_on)}` : "no results yet"} />
        <Stat label="Projected score error" value={shown.projection_mae === null ? "–" : `±${shown.projection_mae}`}
          note={shown.naive_mae === null ? "points, once forecasts are checked"
            : `vs ±${shown.naive_mae} for "nothing changes"${hasLive ? "" : " (backtest)"}`} />
      </section>

      {!hasLive && (
        <p className="flex items-start gap-3 rounded-xl bg-muted/50 px-5 py-4 text-sm">
          <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong>Live tracking started on {on_record.since ? formatDate(on_record.since) : "recently"}.</strong>{" "}
            No live forecast is a week old yet, so there is no live hit rate to show.
            {live.next_check_on && <> The first {on_record.due_next || ""} checks happen on {formatDate(live.next_check_on)}, and this page updates on its own as results come in.</>}
            {backtest.checked > 0 && <> Until then, the breakdowns below use a backtest (the same method replayed on past score history), which is weaker evidence.</>}
          </span>
        </p>
      )}

      {/* Open predictions: the calls on record, before anyone knows the outcome */}
      {data.open.length > 0 && (
        <section className="space-y-4">
          <SectionTitle eyebrow="Called in advance" title="Open predictions"
            note={`Saved the day they were made and checked ${data.horizon_days} days later. Showing the ${data.open.length} due soonest of ${live.pending}.`} />
          <OpenTable data={data} />
        </section>
      )}

      {/* Breakdowns */}
      {shown.checked > 0 && (
        <section className="space-y-6">
          <SectionTitle eyebrow={hasLive ? "Live results" : "Backtest results"} title="Where the forecasts hold up"
            note={hasLive ? "Forecasts recorded in advance and checked a week later." : "Replayed on past score history while live results build up."} />
          <div className="grid gap-10 lg:grid-cols-3">
            <Breakdown title="By forecast">
              {LABEL_ORDER.filter((l) => shown.by_label[l]?.checked).map((l) => (
                <RateBar key={l} title={FORECAST_LABELS[l].title} rate={shown.by_label[l]!} />
              ))}
            </Breakdown>
            <Breakdown title="By confidence" note="If confidence means anything, the high row should score best.">
              {(Object.keys(CONFIDENCE_NAMES) as (keyof typeof CONFIDENCE_NAMES)[])
                .filter((c) => shown.by_confidence[c].checked)
                .map((c) => <RateBar key={c} title={CONFIDENCE_NAMES[c]} rate={shown.by_confidence[c]} />)}
            </Breakdown>
            <Breakdown title="By category">
              {Object.entries(shown.by_category ?? {}).map(([cat, rate]) => (
                <RateBar key={cat} title={cat.charAt(0).toUpperCase() + cat.slice(1)} rate={rate} />
              ))}
            </Breakdown>
          </div>
          <WeeklyChart summary={shown} />
          <RecentChecks data={data} />
        </section>
      )}

      {/* Method */}
      <section className="grid gap-8 rounded-2xl p-6 ring-1 ring-foreground/10 md:p-8 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <SectionTitle eyebrow="The rules" title="How a forecast is scored" />
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
              The first forecast of each day is saved and can&apos;t be changed. Trends that are &ldquo;too early to call&rdquo; make no call and aren&apos;t counted.</li>
            <li className="flex gap-3"><CalendarClock className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
              {data.horizon_days} days later it&apos;s compared with the trend&apos;s real score. A trend that faded out counts as a score of 0.</li>
            <li className="flex gap-3"><Scale className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
              The projected score is also measured against the simplest guess, &ldquo;nothing changes&rdquo;. A forecast that can&apos;t beat that isn&apos;t adding value{beatsNaive === null ? "." : beatsNaive ? ", and so far ours does." : ", and so far ours doesn't: we show that too."}</li>
          </ul>
        </div>
        <dl className="divide-y divide-foreground/[0.08] text-sm">
          {LABEL_ORDER.map((l) => (
            <div key={l} className="grid grid-cols-[9rem_1fr] gap-4 py-3 first:pt-0 last:pb-0">
              <dt className="font-medium">{FORECAST_LABELS[l].title}</dt>
              <dd className="text-muted-foreground">Counts as a hit if: {data.rules[l]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="text-sm text-muted-foreground">
        Live and backtest results are always kept separate.{" "}
        <Link href="/forecast" className="font-medium text-foreground underline-offset-4 hover:underline">See today&apos;s forecasts →</Link>
      </p>
    </div>
  )
}

function SectionTitle({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return (
    <div className="max-w-2xl space-y-1.5">
      <p className="eyebrow text-muted-foreground">{eyebrow}</p>
      <h2 className="font-serif text-3xl font-semibold tracking-tight">{title}</h2>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  )
}

function Breakdown({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

const LABEL_TONE: Record<string, string> = {
  breaking_out: "text-emerald-700", likely_to_peak: "text-amber-700", sustained: "text-sky-700",
  steady: "text-muted-foreground", declining: "text-rose-700",
}

function OpenTable({ data }: { data: TrackRecord }) {
  const today = new Date().toISOString().slice(0, 10)
  const daysLeft = (due: string) => Math.max(0, Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000))
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Trend</th>
            <th className="px-4 py-2.5 font-medium">Call</th>
            <th className="px-4 py-2.5 text-right font-medium">Score then</th>
            <th className="px-4 py-2.5 text-right font-medium">Projected</th>
            <th className="px-4 py-2.5 text-right font-medium">Confidence</th>
            <th className="px-4 py-2.5 font-medium">Made</th>
            <th className="px-4 py-2.5 font-medium">Checked on</th>
          </tr>
        </thead>
        <tbody>
          {data.open.map((r) => {
            const left = daysLeft(r.due_on)
            return (
              <tr key={`${r.slug}-${r.made_on}`} className="border-t border-foreground/5">
                <td className="px-4 py-2.5">
                  <Link href={`/trends/${r.slug}`} className="font-medium hover:underline">{r.trend}</Link>
                  {r.category && <span className="ml-2 text-xs capitalize text-muted-foreground">{r.category}</span>}
                </td>
                <td className={cn("px-4 py-2.5 font-medium", LABEL_TONE[r.label])}>{FORECAST_LABELS[r.label].title}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{Math.round(r.start_score)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{Math.round(r.projected_score)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{Math.round(r.confidence * 100)}%</td>
                <td className="px-4 py-2.5 text-muted-foreground">{formatDate(r.made_on)}</td>
                <td className="px-4 py-2.5">
                  {formatDate(r.due_on)} <span className="text-xs text-muted-foreground">{left === 0 ? "· today" : `· in ${left} day${left === 1 ? "" : "s"}`}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function WeeklyChart({ summary }: { summary: AccuracySummary }) {
  const weeks = summary.weekly.filter((w) => w.checked > 0)
  if (weeks.length < 2) return null
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Hit rate by week the forecast was made</h3>
      <div className="flex items-end gap-2" role="img" aria-label="Weekly hit rate">
        {weeks.map((w) => {
          const v = Math.round((w.hit_rate ?? 0) * 100)
          return (
            <div key={w.week} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-xs tabular-nums">{v}%</span>
              <div className="flex h-28 w-full items-end">
                <div className="w-full rounded-t bg-foreground/70" style={{ height: `${Math.max(v, 2)}%` }} title={`${w.checked} checked`} />
              </div>
              <span className="text-[11px] text-muted-foreground">{formatDate(w.week)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
