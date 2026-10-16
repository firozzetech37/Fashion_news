import { ArrowDownRight, ArrowRight, ArrowUpRight, Hourglass } from "lucide-react"
import { FORECAST_LABELS, type Forecast } from "@/lib/trends"

/** Statistical forecast for one trend: label, projected score and the evidence behind it. */
export function ForecastPanel({ forecast, score }: { forecast: Forecast | null; score: number }) {
  if (!forecast) return null
  const meta = FORECAST_LABELS[forecast.label]
  const early = forecast.label === "too_early"
  const Icon = early ? Hourglass : forecast.slope_per_day > 0.5 ? ArrowUpRight : forecast.slope_per_day < -0.5 ? ArrowDownRight : ArrowRight
  return (
    <div className="grid gap-4 rounded-xl p-5 ring-1 ring-foreground/10 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Statistical forecast</p>
        <p className="flex items-center gap-2 font-serif text-2xl font-bold"><Icon className="size-5" aria-hidden /> {meta.title}</p>
        <p className="text-sm text-muted-foreground">{meta.description}</p>
      </div>
      {!early && (
        <dl className="grid grid-cols-3 gap-5 text-sm">
          <div><dt className="text-xs text-muted-foreground">Next week</dt><dd className="font-serif text-2xl font-bold tabular-nums">{Math.round(forecast.projected_score_7d)}</dd><dd className="text-xs text-muted-foreground">from {Math.round(score)}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Per day</dt><dd className="font-serif text-2xl font-bold tabular-nums">{forecast.slope_per_day > 0 ? "+" : ""}{forecast.slope_per_day.toFixed(1)}</dd><dd className="text-xs text-muted-foreground">last 7 days</dd></div>
          <div><dt className="text-xs text-muted-foreground">Confidence</dt><dd className="font-serif text-2xl font-bold tabular-nums">{Math.round(forecast.confidence * 100)}%</dd><dd className="text-xs text-muted-foreground">{forecast.history_days} days of data</dd></div>
        </dl>
      )}
    </div>
  )
}
