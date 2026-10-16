import { Suspense } from "react"
import type { Metadata } from "next"
import { TrendCard } from "@/components/trends/trend-card"
import { ApiUnavailable, TrendGridSkeleton } from "@/components/trends/trend-grid"
import { FORECAST_LABELS, getJSON, type ForecastData } from "@/lib/trends"

export const metadata: Metadata = { title: "Forecast | TrendScope" }

const ORDER = ["breaking_out", "likely_to_peak", "sustained", "steady", "declining"] as const

export default function ForecastPage() {
  return (
    <div className="container mx-auto space-y-12 px-4 py-12 md:px-8">
      <header className="max-w-2xl space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Intelligence</p>
        <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">Where trends are going</h1>
        <p className="text-muted-foreground">
          A statistical forecast from each trend&apos;s daily score history: how fast it&apos;s moving, and whether the climb is
          speeding up or stalling. It&apos;s deliberately simple (no machine learning yet) and says so when there isn&apos;t enough data.
        </p>
      </header>
      <Suspense fallback={<TrendGridSkeleton />}>
        <ForecastGroups />
      </Suspense>
    </div>
  )
}

async function ForecastGroups() {
  const data = await getJSON<ForecastData>("/api/forecast/")
  if (!data) return <ApiUnavailable />
  return (
    <div className="space-y-14">
      {ORDER.filter((label) => data.groups[label]?.length).map((label) => (
        <section key={label} className="space-y-4">
          <div>
            <h2 className="font-serif text-2xl font-bold">{FORECAST_LABELS[label].title} <span className="text-base font-normal text-muted-foreground">{data.groups[label].length}</span></h2>
            <p className="text-sm text-muted-foreground">{FORECAST_LABELS[label].description}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.groups[label].map((t) => (
              <div key={t.id} className="space-y-1.5">
                <TrendCard trend={t} />
                {t.forecast && (
                  <p className="px-1 text-xs text-muted-foreground">
                    Projected {Math.round(t.forecast.projected_score_7d)} next week · {Math.round(t.forecast.confidence * 100)}% confidence
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="rounded-xl bg-muted/50 p-5 text-sm text-muted-foreground">
        <strong className="text-foreground">{data.too_early} more trends are too early to call</strong>: they have fewer than 4 days of
        history or only one story so far. TrendScope only started collecting recently, so forecasts get more reliable every day.
      </p>
    </div>
  )
}
