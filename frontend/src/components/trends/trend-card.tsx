import Link from "next/link"
import { PublisherImage } from "@/components/ui/publisher-image"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { cn } from "cn"
import { Monogram } from "@/components/brand/wordmark"
import { formatGrowth, isDown, type TrendSummary } from "@/lib/trends"
import { StatusBadge } from "./status-badge"
import { Sparkline } from "./sparkline"

export function TrendCard({ trend }: { trend: TrendSummary }) {
  const down = isDown(trend)
  return (
    <Link
      href={`/trends/${trend.slug}`}
      className="group card-lift flex flex-col gap-4 overflow-hidden rounded-xl bg-card p-5 shadow-soft ring-1 ring-foreground/10"
    >
      {/* Cover photo from the stories behind the trend; a quiet placeholder keeps card heights even in a grid */}
      <div className="photo-edge relative -mx-5 -mt-5 aspect-[16/10] overflow-hidden bg-muted">
        {trend.image_url ? (
          <PublisherImage src={trend.image_url} alt="" loading="lazy"
            className="h-full w-full object-cover object-[50%_25%] transition-transform duration-700 ease-out-expo group-hover:scale-[1.04]" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/30">
            <Monogram className="size-9" />
          </div>
        )}
      </div>
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
      {/* The photo carries the card on phones; the sparkline is detail for larger screens */}
      <Sparkline values={trend.sparkline} className={cn("hidden sm:block", down ? "text-slate-400" : "text-emerald-600")} />
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
