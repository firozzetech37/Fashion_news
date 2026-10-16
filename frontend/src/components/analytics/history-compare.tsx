"use client"

import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts"
import { useIsClient } from "./use-is-client"
import { SERIES_COLORS, STATUS_STYLES, type AnalyticsOverview, type TrendStatus } from "@/lib/trends"

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })

/** Score over time for the current top trends: one axis, ≤4 series, each direct-labelled at its last point. */
const PX_PER_POINT = 2.7 // plot height (~270px) / score range (100)
const LABEL_GAP = 13 / PX_PER_POINT // minimum label spacing, in score points

export function HistoryCompare({ series, data: allData }: { series: AnalyticsOverview["history_series"]; data: AnalyticsOverview["history"] }) {
  const isClient = useIsClient()
  // Start the axis a day before the first trend appears, instead of weeks of empty space
  const first = allData.findIndex((row) => series.some((s) => row[s.slug] != null))
  const data = first > 0 ? allData.slice(first - 1) : allData

  const lastIndex = Object.fromEntries(
    series.map((s) => [s.slug, data.reduce((last, row, i) => (row[s.slug] != null ? i : last), -1)]),
  )
  // Direct labels: nudge apart lines that end at nearly the same score so names don't overprint
  const ends = series
    .map((s) => ({ slug: s.slug, value: Number(data[lastIndex[s.slug]]?.[s.slug] ?? 0) }))
    .sort((a, b) => b.value - a.value)
  const labelShift: Record<string, number> = {}
  ends.forEach((e, i) => {
    const placedAt = i === 0 ? e.value : Math.min(e.value, ends[i - 1].value - labelShift[ends[i - 1].slug] - LABEL_GAP)
    labelShift[e.slug] = e.value - placedAt // positive = move label down
  })

  return (
    <div className="space-y-3">
      {/* legend: always present for ≥2 series; identity never color-alone (lines are also labelled) */}
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {series.map((s, i) => (
          <li key={s.slug} className="flex items-center gap-2">
            <span className="h-0.5 w-4 rounded-full" style={{ background: SERIES_COLORS[i] }} aria-hidden />
            {s.name}
          </li>
        ))}
      </ul>
      <div className="h-80 w-full">
          {isClient && <LineChart responsive style={{ width: "100%", height: "100%" }} data={data} margin={{ top: 12, right: 112, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              labelFormatter={(d) => shortDate(String(d))}
              formatter={(value, key, item) => {
                const s = series.find((x) => x.slug === key)
                const stage = item.payload[`${key}__status`] as TrendStatus | null
                return [`${value}${stage ? ` · ${STATUS_STYLES[stage].label}` : ""}`, s?.name ?? key]
              }}
              contentStyle={{ borderRadius: 8, fontSize: 12 }}
            />
            {series.map((s, i) => (
              <Line key={s.slug} dataKey={s.slug} name={s.slug} stroke={SERIES_COLORS[i]} strokeWidth={2}
                dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }} connectNulls={false}
                isAnimationActive={false}
                label={({ x, y, index }) =>
                  index === lastIndex[s.slug] ? (
                    <text key={s.slug} x={Number(x) + 8} y={Number(y) + labelShift[s.slug] * PX_PER_POINT} dominantBaseline="middle" fontSize={11} fill="var(--foreground)">
                      {s.name.length > 16 ? `${s.name.slice(0, 15)}…` : s.name}
                    </text>
                  ) : <g key={`${s.slug}-${index}`} />
                }
              />
            ))}
          </LineChart>}
      </div>
    </div>
  )
}
