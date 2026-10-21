"use client"

import { useState } from "react"
import { cn } from "cn"
import { MentionsChart, ScoreHistoryChart, SearchInterestChart } from "@/components/trends/trend-charts"
import type { SearchInterest, TrendStatus } from "@/lib/trends"

type Tab = "stories" | "score" | "searches"

/**
 * The trend's three time series in one panel: a tab per chart, each led by a one-line takeaway, so the page
 * shows one chart at a time instead of three stacked. On phones the tabs become a full-width switch.
 */
export function TrendChartsPanel({ timeline, scoreHistory, search }: {
  timeline: { date: string; mentions: number }[]
  scoreHistory: { date: string; trend_score: number; momentum_score: number; status: TrendStatus | null }[]
  search: SearchInterest | null
}) {
  const hasScore = scoreHistory.length > 1
  const hasSearch = !!search?.has_data && search.series.length > 1
  const tabs = ([
    { key: "stories", label: "Stories" },
    hasScore && { key: "score", label: "Score" },
    hasSearch && { key: "searches", label: "Searches" },
  ] as const).filter(Boolean) as { key: Tab; label: string }[]
  const [tab, setTab] = useState<Tab>("stories")

  const last7 = timeline.slice(-7).reduce((n, d) => n + d.mentions, 0)
  const prev7 = timeline.slice(-14, -7).reduce((n, d) => n + d.mentions, 0)
  const total = timeline.reduce((n, d) => n + d.mentions, 0)
  const first = scoreHistory[0]?.trend_score ?? 0
  const latest = scoreHistory.at(-1)?.trend_score ?? 0
  const growth = search?.growth_pct ?? null

  const takeaway: Record<Tab, { big: string; text: string }> = {
    stories: {
      big: String(last7),
      text: `${last7 === 1 ? "story" : "stories"} in the last 7 days${prev7 ? `, vs ${prev7} the week before` : ""} · ${total} in 30 days`,
    },
    score: {
      big: String(Math.round(latest)),
      text: `trend score today, ${latest >= first ? "up" : "down"} ${Math.abs(Math.round(latest - first))} points over ${scoreHistory.length} days`,
    },
    searches: {
      big: growth === null ? "New" : `${growth >= 0 ? "+" : ""}${Math.round(growth)}%`,
      text: `Google searches for "${search?.keyword ?? ""}" over the last 4 weeks, vs the 4 before`,
    },
  }

  return (
    <section className="overflow-hidden rounded-2xl ring-1 ring-foreground/10">
      <div className="flex flex-col gap-4 border-b border-foreground/10 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Momentum</h2>
        {tabs.length > 1 && (
          <div role="tablist" aria-label="Chart" className="grid w-full auto-cols-fr grid-flow-col rounded-full bg-background p-1 ring-1 ring-foreground/10 sm:w-auto">
            {tabs.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                className={cn("rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-200",
                  tab === t.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div role="tabpanel" className="space-y-4 p-4 md:p-6">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-serif text-4xl font-semibold tabular-nums leading-none">{takeaway[tab].big}</span>
          <span className="text-sm text-muted-foreground">{takeaway[tab].text}</span>
        </p>
        {tab === "stories" && <MentionsChart data={timeline} />}
        {tab === "score" && <ScoreHistoryChart data={scoreHistory} />}
        {tab === "searches" && search && <SearchInterestChart data={search.series} />}
      </div>
    </section>
  )
}
