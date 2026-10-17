import { unstable_rethrow } from "next/navigation"
import { API_URL, type Article } from "@/lib/api"

export type TrendStatus = "emerging" | "rising" | "trending" | "peak" | "declining"

export interface TrendStats {
  window_days: number
  mentions_current: number
  mentions_previous: number
  mentions_30d: number
  sources_30d: number
  celebrities: string[]
  brands: string[]
  runway_mentions: number
}

export interface TrendSummary {
  id: string
  name: string
  slug: string
  type: string | null
  category: string | null
  trend_score: number
  momentum_score: number
  growth_pct: number | null
  status: TrendStatus | null
  confidence: number | null
  stats: TrendStats | null
  first_detected: string | null
  last_detected: string | null
  sparkline: number[]
  forecast: Forecast | null
}

export interface TrendExplanation {
  stage: TrendStatus
  momentum: number
  confidence: number
  why_trending: string
  drivers: string[]
  risks: string[]
  short_term_outlook: string
  long_term_outlook: string
}

export interface NamedCount { name: string; count: number }

export interface TrendDetail extends TrendSummary {
  aliases: string[]
  score_breakdown: Record<string, number | null> | null
  explanation: TrendExplanation | null
  explanation_updated_at: string | null
  explanation_pending: boolean
  timeline: { date: string; mentions: number }[]
  score_history: { date: string; trend_score: number; momentum_score: number; status: TrendStatus | null }[]
  celebrities: NamedCount[]
  brands: NamedCount[]
  sources: NamedCount[]
  related: { name: string; slug: string; status: TrendStatus | null; trend_score: number; shared_articles: number }[]
  articles: Article[]
}

export interface CelebritySignal {
  name: string
  articles: number
  image_url: string | null
  headline: string | null
  url: string | null
  trends: string[]
}

export interface HomeData {
  trending: TrendSummary[]
  radar: TrendSummary[]
  emerging: TrendSummary[]
  celebrities: CelebritySignal[]
  latest: Article[]
  stats: { trends: number; articles: number; sources: number }
}

/** Server-side GET. Returns null when the API is down so pages can render an empty state instead of crashing. */
export async function getJSON<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`${res.status}`)
    return (await res.json()) as T
  } catch (err) {
    unstable_rethrow(err) // let Next.js handle its own control-flow errors (e.g. prerender aborts)
    console.error(`TrendScope API request failed: ${path}`, err)
    return null
  }
}

export const STATUS_STYLES: Record<TrendStatus, { label: string; className: string }> = {
  emerging: { label: "Emerging", className: "bg-violet-50 text-violet-800 ring-violet-200" },
  rising: { label: "Rising", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  trending: { label: "Trending", className: "bg-rose-50 text-rose-900 ring-rose-200" },
  peak: { label: "Peak", className: "bg-amber-50 text-amber-900 ring-amber-200" },
  declining: { label: "Declining", className: "bg-slate-100 text-slate-700 ring-slate-200" },
}

export const COMPONENT_LABELS: Record<string, string> = {
  mention_growth: "Mention growth",
  source_diversity: "Source diversity",
  celebrity_influence: "Celebrity influence",
  brand_adoption: "Brand adoption",
  social_signals: "Social signals",
  search_interest: "Search interest",
  fashion_week: "Fashion week",
}

export const COMPONENT_WEIGHTS: Record<string, number> = {
  mention_growth: 25, source_diversity: 20, celebrity_influence: 15, brand_adoption: 15,
  social_signals: 10, search_interest: 10, fashion_week: 5,
}

/** Share-of-voice change. With no previous-window mentions a trend is "New", unless it has already gone quiet. */
export function formatGrowth(growth: number | null, status?: TrendStatus | null) {
  if (growth === null) return status === "declining" ? "Quiet" : "New"
  return `${growth > 0 ? "+" : ""}${Math.round(growth)}%`
}

export const isDown = (t: { growth_pct: number | null; status: TrendStatus | null }) =>
  (t.growth_pct ?? 0) < 0 || t.status === "declining"

export function timeAgo(iso: string | null) {
  if (!iso) return ""
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

// ---- Celebrities, brands, verticals, search -------------------------------

export type EntityKind = "celebrity" | "brand"
export type Vertical = "fashion" | "bollywood" | "hollywood" | "runway"

export interface EntitySummary {
  id: string
  kind: EntityKind
  name: string
  slug: string
  vertical: Vertical | null
  country: string | null
  industry: string | null
  known_for: string | null
  image_url: string | null
  image_headline: string | null
  stories_total: number
  stories_30d: number
  fashion_stories_30d: number
  influence_score: number
  top_trends: { name: string; slug: string; count: number }[]
  last_seen: string | null
}

export interface EntityDetail extends EntitySummary {
  aliases: string[]
  related: { name: string; slug: string; count: number }[]
  articles: Article[]
  looks: Article[]
}

export interface VerticalData {
  vertical: Vertical
  trends: TrendSummary[]
  emerging: TrendSummary[]
  entity_kind: EntityKind
  entities: EntitySummary[]
  stories: Article[]
  stats: { stories: number; trends: number }
}

export interface SearchResults {
  query: string
  did_you_mean: string | null
  semantic: boolean
  trends: TrendSummary[]
  celebrities: EntitySummary[]
  brands: EntitySummary[]
  articles: Article[]
}

export const entityPath = (e: { kind: EntityKind; slug: string }) =>
  `/${e.kind === "celebrity" ? "celebrities" : "brands"}/${e.slug}`

// ---- Analytics ---------------------------------------------------------------

export interface RadarPoint {
  name: string
  slug: string
  type: string | null
  category: string | null
  status: TrendStatus | null
  trend_score: number
  momentum_score: number
  growth_pct: number | null
  mentions_30d: number
}

export interface Mover extends RadarPoint {
  change: number
  was: number | null
}

export interface AnalyticsOverview {
  lifecycle: Record<TrendStatus, number>
  active_trends: number
  new_this_week: number
  history_series: { slug: string; name: string; status: TrendStatus | null }[]
  history: Record<string, string | number | null>[]
  risers: Mover[]
  fallers: Mover[]
  type_leaders: Record<string, RadarPoint[]>
}

/** Categorical series colors (validated: adjacent CVD ΔE ≥ 9.1 on white). Fixed order, never cycled. */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]

// ---- Forecast, alerts, assistant ---------------------------------------------

export type ForecastLabel = "breaking_out" | "likely_to_peak" | "sustained" | "steady" | "declining" | "too_early"

export interface Forecast {
  label: ForecastLabel
  projected_score_7d: number
  slope_per_day: number
  previous_slope_per_day: number | null
  history_days: number
  confidence: number
}

export const FORECAST_LABELS: Record<ForecastLabel, { title: string; description: string }> = {
  breaking_out: { title: "Breaking out", description: "Climbing fast: score up 2+ points a day over the last week." },
  likely_to_peak: { title: "Likely to peak", description: "Already trending, but the climb has stalled or slowed sharply." },
  sustained: { title: "Sustained", description: "Trending and holding steady." },
  steady: { title: "Steady", description: "Active, but not moving much either way." },
  declining: { title: "Declining", description: "Score falling, or the trend has gone quiet." },
  too_early: { title: "Too early to call", description: "Fewer than 4 days of history or 2 stories: not enough data yet." },
}

export interface ForecastData {
  groups: Record<Exclude<ForecastLabel, "too_early">, TrendSummary[]>
  too_early: number
}

export interface HitRate {
  checked: number
  hits: number
  hit_rate: number | null
}

export interface AccuracySummary extends HitRate {
  projection_mae: number | null
  naive_mae: number | null
  by_label: Partial<Record<Exclude<ForecastLabel, "too_early">, HitRate>>
  by_confidence: Record<"low" | "medium" | "high", HitRate>
  weekly: { week: string; checked: number; hit_rate: number | null }[]
  pending: number
  next_check_on: string | null
}

export interface ForecastAccuracy {
  horizon_days: number
  rules: Record<Exclude<ForecastLabel, "too_early">, string>
  live: AccuracySummary
  backtest: AccuracySummary
  recent_source: "live" | "backtest"
  recent: {
    trend: string
    slug: string
    label: Exclude<ForecastLabel, "too_early">
    made_on: string
    start_score: number
    projected_score: number
    actual_score: number
    confidence: number
    hit: boolean
  }[]
}

export interface TrendAlert {
  id: number
  kind: "stage_up" | "breakout" | "new_emerging"
  date: string
  title: string
  message: string | null
  to_status: TrendStatus | null
  score: number | null
  created_at: string
  trend_slug: string
  trend_status: TrendStatus | null
}

export interface AskResponse {
  question: string
  answer: string
  confidence: "low" | "medium" | "high"
  trends: { trend: TrendSummary; reason: string }[]
  articles: Article[]
  follow_up_questions: string[]
  signals_used: { trends: number; articles: number; entities: number }
}
