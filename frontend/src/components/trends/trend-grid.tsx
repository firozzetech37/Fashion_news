import { getJSON, type TrendSummary } from "@/lib/trends"
import { TrendCard } from "./trend-card"

/** Fetches and renders a grid of trends. Render inside <Suspense>. */
export async function TrendGrid({ path, empty }: { path: string; empty: string }) {
  const data = await getJSON<{ items: TrendSummary[]; total: number }>(path)
  if (!data) return <ApiUnavailable />
  if (!data.items.length) return <p className="text-muted-foreground">{empty}</p>
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {data.items.map((t) => <TrendCard key={t.id} trend={t} />)}
    </div>
  )
}

export function TrendGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Loading trends">
      {Array.from({ length: count }, (_, i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />)}
    </div>
  )
}

export function ApiUnavailable() {
  return (
    <p className="rounded-xl bg-muted/50 p-6 text-sm text-muted-foreground">
      Trend data is unavailable right now. Make sure the TrendScope API is running on port 8000.
    </p>
  )
}
