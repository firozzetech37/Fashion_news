import Link from "next/link"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { cn } from "cn"
import { formatGrowth, isDown, type TrendSummary } from "@/lib/trends"
import { StatusBadge } from "./status-badge"
import { Sparkline } from "./sparkline"

export function TrendCard({ trend }: { trend: TrendSummary }) {
  const down = isDown(trend)
  return (
    <Link
      href={`/trends/${trend.slug}`}
      className="group card-lift flex flex-col gap-4 rounded-xl bg-card p-5 shadow-soft ring-1 ring-foreground/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-xl font-semibold leading-tight">
            <span className="link-reveal">{trend.name}</span>
          </h3>
          <p className="mt-1.5 text-xs capitalize text-muted-foreground">{[trend.type, trend.category].filter(Boolean).join(" · ")}</p>
        </div>
        <span className="font-serif text-3xl font-semibold leading-none tabular-nums" title="Trend score out of 100">
          {Math.round(trend.trend_score)}
        </span>
      </div>
      <Sparkline values={trend.sparkline} className={down ? "text-slate-400" : "text-emerald-600"} />
      <div className="flex items-center justify-between text-sm">
        <StatusBadge status={trend.status} />
        <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", down ? "text-slate-500" : "text-emerald-700")}>
          {formatGrowth(trend.growth_pct, trend.status)}
          {down ? <ArrowDownRight className="size-4" aria-hidden /> : <ArrowUpRight className="size-4" aria-hidden />}
        </span>
      </div>
      {trend.stats && (
        <p className="text-xs text-muted-foreground">
          {trend.stats.mentions_30d} {trend.stats.mentions_30d === 1 ? "story" : "stories"} · {trend.stats.sources_30d}{" "}
          {trend.stats.sources_30d === 1 ? "source" : "sources"}
        </p>
      )}
    </Link>
  )
}
