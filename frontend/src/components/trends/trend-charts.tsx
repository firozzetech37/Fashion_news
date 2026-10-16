"use client"

import { useIsClient } from "@/components/analytics/use-is-client"
import { STATUS_STYLES, type TrendStatus } from "@/lib/trends"
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts"

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })

export function MentionsChart({ data }: { data: { date: string; mentions: number }[] }) {
  const isClient = useIsClient()
  return (
    <div className="h-56 w-full">
        {isClient && <BarChart responsive style={{ width: "100%", height: "100%" }} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            labelFormatter={(d) => shortDate(String(d))}
            formatter={(v) => [v, "Stories"]}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="mentions" fill="var(--foreground)" radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>}
    </div>
  )
}

export function ScoreHistoryChart({ data }: { data: { date: string; trend_score: number; status: TrendStatus | null }[] }) {
  const isClient = useIsClient()
  return (
    <div className="h-48 w-full">
        {isClient && <LineChart responsive style={{ width: "100%", height: "100%" }} data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            labelFormatter={(d) => shortDate(String(d))}
            formatter={(v, _k, item) => {
              const stage = item.payload.status as TrendStatus | null
              return [`${v}${stage ? ` · ${STATUS_STYLES[stage].label}` : ""}`, "Trend score"]
            }}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Line type="monotone" dataKey="trend_score" stroke="var(--foreground)" strokeWidth={2} dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }} isAnimationActive={false} />
        </LineChart>}
    </div>
  )
}
