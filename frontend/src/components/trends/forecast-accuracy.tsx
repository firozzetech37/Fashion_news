import Link from "next/link"
import { CheckCircle2, XCircle } from "lucide-react"
import { cn } from "cn"
import { FORECAST_LABELS, type ForecastAccuracy, type HitRate } from "@/lib/trends"

const LABEL_ORDER = ["breaking_out", "likely_to_peak", "sustained", "steady", "declining"] as const
const CONFIDENCE_NAMES = { low: "Low confidence", medium: "Medium confidence", high: "High confidence" } as const

const pct = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`)

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
}

/** "Track record" section of the forecast page: how often past forecasts came true. */
export function ForecastAccuracyPanel({ data }: { data: ForecastAccuracy }) {
  const { live, backtest } = data
  const hasLive = live.checked > 0
  const shown = hasLive ? live : backtest
  if (!hasLive && backtest.checked === 0 && live.pending === 0) return null

  return (
    <section className="space-y-6 rounded-2xl p-6 ring-1 ring-foreground/10 md:p-8">
      <div className="max-w-2xl space-y-2">
        <p className="eyebrow text-muted-foreground">Track record</p>
        <h2 className="font-serif text-3xl font-semibold tracking-tight">How often these forecasts come true</h2>
        <p className="text-sm text-muted-foreground">
          Every forecast is saved when it&apos;s made and checked against the real score {data.horizon_days} days later.
          {hasLive
            ? " These numbers are from forecasts recorded in advance."
            : " Live results start once the first saved forecasts are a week old. Until then, the numbers below are a backtest: the same method replayed on past score history, which is weaker evidence."}
        </p>
      </div>

      {!hasLive && live.pending > 0 && (
        <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
          <strong>{live.pending} live forecasts are waiting to be checked.</strong>{" "}
          {live.next_check_on && <>The first results arrive on {formatDate(live.next_check_on)}.</>}
        </p>
      )}

      {shown.checked > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={hasLive ? "Hit rate" : "Backtest hit rate"} value={pct(shown.hit_rate)}
              note={`${shown.hits} of ${shown.checked} forecasts came true`} />
            <Stat label="Projected score error" value={shown.projection_mae === null ? "–" : `±${shown.projection_mae}`}
              note={shown.naive_mae === null ? "points, on average" : `points on average, vs ±${shown.naive_mae} if we assumed nothing changes`} />
            <Stat label="Checked so far" value={String(shown.checked)}
              note={shown.pending ? `${shown.pending} more waiting for their ${data.horizon_days}-day check` : "forecasts"} />
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">By forecast</h3>
              {LABEL_ORDER.filter((l) => shown.by_label[l]?.checked).map((l) => (
                <RateBar key={l} title={FORECAST_LABELS[l].title} hint={data.rules[l]} rate={shown.by_label[l]!} />
              ))}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">By confidence</h3>
              {(Object.keys(CONFIDENCE_NAMES) as (keyof typeof CONFIDENCE_NAMES)[])
                .filter((c) => shown.by_confidence[c].checked)
                .map((c) => <RateBar key={c} title={CONFIDENCE_NAMES[c]} rate={shown.by_confidence[c]} />)}
              <p className="text-xs text-muted-foreground">
                If the confidence numbers mean something, the high-confidence row should have the best hit rate.
              </p>
            </div>
          </div>

          <RecentChecks data={data} />
        </>
      )}

      {hasLive && backtest.checked > 0 && (
        <p className="text-xs text-muted-foreground">
          Backtest for comparison: {pct(backtest.hit_rate)} of {backtest.checked} replayed forecasts came true.
        </p>
      )}
    </section>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="space-y-1 rounded-xl bg-muted/50 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="font-serif text-3xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  )
}

function RateBar({ title, hint, rate }: { title: string; hint?: string; rate: HitRate }) {
  const value = Math.round((rate.hit_rate ?? 0) * 100)
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>
          {title}
          {hint && <span className="ml-2 text-xs text-muted-foreground">{hint}</span>}
        </span>
        <span className="shrink-0 tabular-nums">
          <strong>{value}%</strong> <span className="text-xs text-muted-foreground">of {rate.checked}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${title}: ${value}% hit rate`}>
        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function RecentChecks({ data }: { data: ForecastAccuracy }) {
  if (!data.recent.length) return null
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">
        Latest checks {data.recent_source === "backtest" && <span className="font-normal text-muted-foreground">(backtest)</span>}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-foreground/10">
              <th className="py-2 pr-3 font-medium">Trend</th>
              <th className="py-2 pr-3 font-medium">Forecast</th>
              <th className="py-2 pr-3 font-medium">Made</th>
              <th className="py-2 pr-3 text-right font-medium">Score then</th>
              <th className="py-2 pr-3 text-right font-medium">Projected</th>
              <th className="py-2 pr-3 text-right font-medium">Actual</th>
              <th className="py-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map((r) => (
              <tr key={`${r.slug}-${r.made_on}`} className="border-b border-foreground/5 last:border-0">
                <td className="py-2 pr-3"><Link href={`/trends/${r.slug}`} className="font-medium hover:underline">{r.trend}</Link></td>
                <td className="py-2 pr-3 text-muted-foreground">{FORECAST_LABELS[r.label].title}</td>
                <td className="py-2 pr-3 text-muted-foreground">{formatDate(r.made_on)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{Math.round(r.start_score)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{Math.round(r.projected_score)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{Math.round(r.actual_score)}</td>
                <td className="py-2">
                  <span className={cn("inline-flex items-center gap-1 text-xs font-medium", r.hit ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                    {r.hit ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                    {r.hit ? "Came true" : "Missed"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
