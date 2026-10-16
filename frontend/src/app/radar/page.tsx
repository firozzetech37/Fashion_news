import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { cn } from "cn"
import { TrendRadar } from "@/components/analytics/trend-radar"
import { StatusBadge } from "@/components/trends/status-badge"
import { ApiUnavailable } from "@/components/trends/trend-grid"
import { formatGrowth, getJSON, type RadarPoint } from "@/lib/trends"

export const metadata: Metadata = { title: "Trend Radar | TrendScope" }

const VERTICALS = [["", "All"], ["fashion", "Fashion"], ["bollywood", "Bollywood"], ["hollywood", "Hollywood"], ["runway", "Runway"]]

export default function RadarPage({ searchParams }: PageProps<"/radar">) {
  return (
    <div className="container mx-auto space-y-8 px-4 py-12 md:px-8">
      <header className="max-w-2xl space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Intelligence</p>
        <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">Trend Radar</h1>
        <p className="text-muted-foreground">
          Every active trend at a glance: how far along its lifecycle it is, what kind of trend it is, and how strong the signal is.
        </p>
      </header>
      <Suspense fallback={<div className="mx-auto aspect-square w-full max-w-[760px] animate-pulse rounded-full bg-muted" />}>
        {searchParams.then((sp) => <RadarContent vertical={typeof sp.vertical === "string" ? sp.vertical : ""} />)}
      </Suspense>
    </div>
  )
}

async function RadarContent({ vertical }: { vertical: string }) {
  const points = await getJSON<RadarPoint[]>(`/api/analytics/radar?limit=60${vertical ? `&vertical=${vertical}` : ""}`)
  return (
    <div className="space-y-10">
      <nav aria-label="Filter by vertical" className="flex flex-wrap gap-2">
        {VERTICALS.map(([value, label]) => (
          <Link key={label} href={value ? `/radar?vertical=${value}` : "/radar"} aria-current={vertical === value ? "page" : undefined}
            className={cn("rounded-full px-3.5 py-1 text-sm ring-1 ring-foreground/15", vertical === value ? "bg-foreground text-background" : "hover:bg-muted")}>
            {label}
          </Link>
        ))}
      </nav>
      {!points ? <ApiUnavailable /> : points.length === 0 ? (
        <p className="text-muted-foreground">No active trends for this vertical yet.</p>
      ) : (
        <>
          <TrendRadar points={points} />
          {/* Table view: the same data, readable without the chart */}
          <details className="rounded-xl ring-1 ring-foreground/10">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">View as table ({points.length} trends)</summary>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="px-4 py-2 font-medium">Trend</th><th className="px-4 py-2 font-medium">Type</th><th className="px-4 py-2 font-medium">Stage</th><th className="px-4 py-2 text-right font-medium">Score</th><th className="px-4 py-2 text-right font-medium">Growth</th><th className="px-4 py-2 text-right font-medium">Stories (30d)</th></tr>
                </thead>
                <tbody className="divide-y">
                  {points.map((p) => (
                    <tr key={p.slug}>
                      <td className="px-4 py-2"><Link href={`/trends/${p.slug}`} className="hover:underline">{p.name}</Link></td>
                      <td className="px-4 py-2 capitalize text-muted-foreground">{p.type}</td>
                      <td className="px-4 py-2"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-2 text-right tabular-nums">{Math.round(p.trend_score)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatGrowth(p.growth_pct, p.status)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{p.mentions_30d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  )
}
