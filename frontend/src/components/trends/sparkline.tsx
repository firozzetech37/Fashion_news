import { cn } from "cn"

/** Tiny inline SVG line of daily mention counts. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null
  const w = 100, h = 28, max = Math.max(...values, 1)
  const points = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - (v / max) * (h - 4)])
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className={cn("h-7 w-full overflow-visible", className)}>
      <polygon points={`0,${h} ${line} ${w},${h}`} className="fill-current opacity-10" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}
