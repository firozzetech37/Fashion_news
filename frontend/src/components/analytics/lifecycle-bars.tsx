import { STATUS_STYLES, type TrendStatus } from "@/lib/trends"

const ORDER: TrendStatus[] = ["emerging", "rising", "trending", "peak", "declining"]

/** How many active trends sit at each lifecycle stage. One hue: it's magnitude, not identity. */
export function LifecycleBars({ counts }: { counts: Record<TrendStatus, number> }) {
  const max = Math.max(...ORDER.map((s) => counts[s] ?? 0), 1)
  return (
    <ul className="space-y-3">
      {ORDER.map((stage) => {
        const n = counts[stage] ?? 0
        return (
          <li key={stage} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-3 text-sm" title={`${n} ${stage} trends`}>
            <span>{STATUS_STYLES[stage].label}</span>
            <div className="h-3 overflow-hidden rounded-r-[4px] bg-muted">
              <div className="h-full rounded-r-[4px] bg-foreground" style={{ width: `${(n / max) * 100}%`, minWidth: n ? 3 : 0 }} />
            </div>
            <span className="text-right tabular-nums text-muted-foreground">{n}</span>
          </li>
        )
      })}
    </ul>
  )
}
