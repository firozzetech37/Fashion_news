import { createClient } from "@/utils/supabase/client"

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

/** The signed-in user's Supabase token, for admin-only API calls (browser only). */
export async function authHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {}
  const { data } = await createClient().auth.getSession()
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}
}

/** API error that keeps the HTTP status, so pages can tell "sign in" apart from "server down". */
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export const needsAdmin = (err: unknown) => err instanceof ApiError && (err.status === 401 || err.status === 403)

export const SOURCE_CATEGORIES = [
  "fashion", "bollywood", "hollywood", "celebrity", "streetwear",
  "luxury", "beauty", "footwear", "menswear", "other",
] as const

export type SourceCategory = (typeof SOURCE_CATEGORIES)[number]
export type SourceStatus = "never" | "healthy" | "warning" | "error"

export interface Source {
  id: string
  name: string
  url: string
  feed_url: string
  type: string | null
  category: SourceCategory | null
  country: string | null
  language: string
  collection_method: string | null
  active: boolean
  created_at: string | null
  last_collected_at: string | null
  last_status: SourceStatus | null
  last_error: string | null
  last_new_articles: number | null
  consecutive_failures: number
  article_count: number
}

export type SourceInput = Pick<Source, "name" | "url" | "feed_url" | "country" | "language" | "active"> & {
  category: SourceCategory
}

export interface FeedTestResult {
  ok: boolean
  feed_title: string | null
  entry_count: number
  error: string | null
  sample: { title: string; url: string; published_at: string | null; image_url: string | null }[]
}

export interface CollectResult {
  source_id: string
  status: SourceStatus
  new_articles: number
  skipped_duplicates: number
  error: string | null
}

export interface AdminOverview {
  sources_total: number
  sources_active: number
  sources_by_status: Partial<Record<SourceStatus, number>>
  articles_total: number
  articles_last_24h: number
  articles_pending_ai: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(await authHeaders()), ...init?.headers },
    cache: "no-store",
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (typeof body.detail === "string") detail = body.detail
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: { loc: string[]; msg: string }) => `${d.loc.at(-1)}: ${d.msg}`).join(", ")
    } catch {}
    throw new ApiError(detail, res.status)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  overview: () => request<AdminOverview>("/api/admin/overview"),
  listSources: () => request<Source[]>("/api/sources/"),
  createSource: (data: SourceInput) => request<Source>("/api/sources/", { method: "POST", body: JSON.stringify(data) }),
  updateSource: (id: string, data: Partial<SourceInput>) =>
    request<Source>(`/api/sources/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteSource: (id: string) => request<void>(`/api/sources/${id}`, { method: "DELETE" }),
  testFeed: (feed_url: string) =>
    request<FeedTestResult>("/api/sources/test", { method: "POST", body: JSON.stringify({ feed_url }) }),
  collectSource: (id: string) => request<CollectResult>(`/api/sources/${id}/collect`, { method: "POST" }),
  collectAll: () => request<{ queued: number }>("/api/sources/collect-all", { method: "POST" }),
}

// ---- AI pipeline -------------------------------------------------------

export type ArticleStatus = "pending" | "processing" | "processed" | "failed"
export type TrendDirection = "emerging" | "rising" | "stable" | "declining"

export interface ExtractedTrend {
  name: string
  type: string
  category: string
  direction: TrendDirection
  confidence: number
  evidence: string
}

export interface Article {
  id: string
  source_id: string
  source_name: string | null
  title: string
  url: string
  published_at: string | null
  collected_at: string | null
  image_url: string | null
  raw_description: string | null
  category: string | null
  status: ArticleStatus
  ai_processed: boolean
  fashion_relevance: number | null
  entities: Record<string, string[]> | null
  fashion_elements: Record<string, string[]> | null
  ai_trends: ExtractedTrend[] | null
  ai_summary: string | null
  trend_explanation: string | null
  sentiment: "positive" | "neutral" | "negative" | null
  ai_confidence: number | null
  duplicate_of_id: string | null
  ai_model: string | null
  ai_attempts: number
  ai_error: string | null
  ai_processed_at: string | null
}

export interface AIPipeline {
  by_status: Record<ArticleStatus, number>
  processed_last_24h: number
  failed_permanently: number
  success_rate: number | null
  duplicates: number
  with_trends: number
  model: string
  embedding_model: string
  max_attempts: number
  recent_processed: Article[]
  recent_failures: Article[]
}

export const aiApi = {
  pipeline: () => request<AIPipeline>("/api/admin/ai"),
  processNow: (limit = 25) => request<{ queued: number }>(`/api/admin/ai/process?limit=${limit}`, { method: "POST" }),
  retryFailed: () => request<{ requeued: number }>("/api/admin/ai/retry-failed", { method: "POST" }),
  reprocess: (id: string) => request<Article>(`/api/articles/${id}/reprocess`, { method: "POST" }),
}
