"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { formatGrowth, STATUS_STYLES, type RadarPoint, type TrendStatus } from "@/lib/trends"

/** Rings, centre outwards: where a trend sits in its lifecycle. */
const RINGS: { status: TrendStatus; label: string }[] = [
  { status: "peak", label: "Peak" },
  { status: "trending", label: "Trending" },
  { status: "rising", label: "Rising" },
  { status: "emerging", label: "Emerging" },
  { status: "declining", label: "Cooling" },
]

/** Sectors: what kind of trend it is. Types the AI produces are folded into seven readable groups. */
const SECTORS: { label: string; types: string[] }[] = [
  { label: "Colors", types: ["color"] },
  { label: "Clothing", types: ["clothing", "silhouette"] },
  { label: "Fabrics & prints", types: ["fabric", "pattern", "print"] },
  { label: "Footwear", types: ["footwear"] },
  { label: "Accessories", types: ["accessory", "jewelry"] },
  { label: "Beauty", types: ["makeup", "hair"] },
  { label: "Aesthetics", types: ["aesthetic", "styling", "brand", "other"] },
]

const SIZE = 760
const C = SIZE / 2
const MARGIN_X = 90 // room for sector labels at 3 and 9 o'clock
const RING_W = 62
const INNER = 34 // keep the centre free so the innermost ring isn't a pinpoint
const LABELLED = 14 // direct-label only the strongest trends; the rest via hover + table

/** White outline behind text (painted first) keeps labels readable where they cross marks or grid. */
const HALO = { stroke: "var(--background)", strokeWidth: 3, paintOrder: "stroke" as const, strokeLinejoin: "round" as const }

const sectorOf = (type: string | null) => {
  const i = SECTORS.findIndex((s) => s.types.includes(type ?? "other"))
  return i === -1 ? SECTORS.length - 1 : i
}

const polar = (r: number, angle: number) => [C + r * Math.cos(angle), C + r * Math.sin(angle)]

interface Placed extends RadarPoint { x: number; y: number; r: number; labelled: boolean }

function layout(points: RadarPoint[]): Placed[] {
  const span = (2 * Math.PI) / SECTORS.length
  const cells = new Map<string, RadarPoint[]>()
  for (const p of points) {
    const ring = Math.max(0, RINGS.findIndex((r) => r.status === p.status))
    const key = `${ring}:${sectorOf(p.type)}`
    cells.set(key, [...(cells.get(key) ?? []), p])
  }
  const top = new Set([...points].sort((a, b) => b.trend_score - a.trend_score).slice(0, LABELLED).map((p) => p.slug))
  const placed: Placed[] = []
  for (const [key, cell] of cells) {
    const [ring, sector] = key.split(":").map(Number)
    const sorted = [...cell].sort((a, b) => b.trend_score - a.trend_score)
    const start = -Math.PI / 2 + sector * span
    const pad = span * 0.12
    sorted.forEach((p, i) => {
      // spread evenly across the sector; alternate depth inside the ring so neighbours don't touch
      const angle = start + pad + ((i + 0.5) * (span - 2 * pad)) / sorted.length
      const depth = sorted.length > 8 ? [0.22, 0.5, 0.78][i % 3] : sorted.length > 3 ? (i % 2 ? 0.7 : 0.3) : 0.5
      const radius = INNER + ring * RING_W + RING_W * depth
      const [x, y] = polar(radius, angle)
      placed.push({ ...p, x, y, r: 4 + (p.trend_score / 100) * 5, labelled: top.has(p.slug) })
    })
  }
  return placed
}

export function TrendRadar({ points }: { points: RadarPoint[] }) {
  const router = useRouter()
  const [hover, setHover] = useState<Placed | null>(null)
  const placed = useMemo(() => layout(points), [points])
  const span = 360 / SECTORS.length

  return (
    <div className="relative mx-auto w-full max-w-[900px]">
      <svg viewBox={`${-MARGIN_X} 0 ${SIZE + 2 * MARGIN_X} ${SIZE}`} className="h-auto w-full" role="img"
        aria-label={`Trend radar of ${points.length} trends by lifecycle stage and type. A table of the same data follows.`}>
        {/* rings: lifecycle, recessive */}
        {RINGS.map((ring, i) => (
          <circle key={ring.status} cx={C} cy={C} r={INNER + (i + 1) * RING_W}
            className={i % 2 ? "fill-transparent" : "fill-muted/60"} stroke="var(--border)" strokeWidth={1} />
        ))}
        {/* sector dividers + labels */}
        {SECTORS.map((sector, i) => {
          const a = -Math.PI / 2 + (i * span * Math.PI) / 180
          const [x2, y2] = polar(INNER + RINGS.length * RING_W, a)
          const mid = a + (span * Math.PI) / 360
          const [lx, ly] = polar(INNER + RINGS.length * RING_W + 22, mid)
          return (
            <g key={sector.label}>
              <line x1={C} y1={C} x2={x2} y2={y2} stroke="var(--border)" strokeWidth={1} />
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" {...HALO}
                className="fill-muted-foreground text-[13px] font-semibold uppercase tracking-wider">{sector.label}</text>
            </g>
          )
        })}
        {/* ring labels along the top axis */}
        {RINGS.map((ring, i) => (
          <text key={ring.status} x={C + 4} y={C - (INNER + i * RING_W + RING_W / 2)} dominantBaseline="middle" {...HALO}
            className="pointer-events-none fill-muted-foreground text-[11px]">{ring.label}</text>
        ))}
        {/* trends */}
        {placed.map((p) => {
          const active = hover?.slug === p.slug
          return (
            <a key={p.slug} href={`/trends/${p.slug}`} aria-label={`${p.name}, ${p.status}, score ${Math.round(p.trend_score)}`}
              onClick={(e) => { e.preventDefault(); router.push(`/trends/${p.slug}`) }}
              onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p)} onBlur={() => setHover(null)}>
              {/* invisible hit target larger than the mark */}
              <circle cx={p.x} cy={p.y} r={Math.max(p.r + 6, 12)} fill="transparent" />
              <circle cx={p.x} cy={p.y} r={active ? p.r + 2 : p.r}
                fill="var(--foreground)" fillOpacity={hover && !active ? 0.35 : 0.9}
                stroke="var(--background)" strokeWidth={2} className="transition-all" />
            </a>
          )
        })}
        {/* labels on top of every dot so later marks never cover them */}
        {placed.filter((p) => p.labelled).map((p) => (
          <text key={`label-${p.slug}`} x={p.x + p.r + 5} y={p.y} dominantBaseline="middle" {...HALO}
            className="pointer-events-none fill-foreground text-[11px] font-medium"
            opacity={hover && hover.slug !== p.slug ? 0.35 : 1}>
            {p.name}
          </text>
        ))}
      </svg>

      {hover && (
        <div role="status" className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-full rounded-lg bg-background p-3 text-sm shadow-lg ring-1 ring-foreground/10"
          style={{ left: `${((hover.x + MARGIN_X) / (SIZE + 2 * MARGIN_X)) * 100}%`, top: `calc(${(hover.y / SIZE) * 100}% - 14px)` }}>
          <p className="font-serif text-base font-semibold leading-tight">{hover.name}</p>
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">{hover.type} · {STATUS_STYLES[hover.status ?? "emerging"].label}</p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div><dt className="text-muted-foreground">Score</dt><dd className="font-semibold tabular-nums">{Math.round(hover.trend_score)}</dd></div>
            <div><dt className="text-muted-foreground">Growth</dt><dd className="font-semibold tabular-nums">{formatGrowth(hover.growth_pct, hover.status)}</dd></div>
            <div><dt className="text-muted-foreground">Stories</dt><dd className="font-semibold tabular-nums">{hover.mentions_30d}</dd></div>
          </dl>
        </div>
      )}
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Rings show lifecycle stage (centre = peak). Dot size shows trend score. The {LABELLED} strongest trends are labelled.
      </p>
    </div>
  )
}
