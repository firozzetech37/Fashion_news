import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { PublisherImage } from "@/components/ui/publisher-image"
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react"
import { cn } from "cn"
import { ArticleCard } from "@/components/trends/article-card"
import { TimeAgo } from "@/components/trends/time-ago"
import { ApiUnavailable } from "@/components/trends/trend-grid"
import type { Article } from "@/lib/api"
import { getJSON } from "@/lib/trends"

export const metadata: Metadata = {
  title: "News",
  description: "The latest fashion stories from across fashion, Bollywood, Hollywood and the runway, with TrendScope's AI summary of each.",
}

const PER_PAGE = 24
/** Stories the AI rated at least this much about fashion; the rest is general entertainment news */
const MIN_RELEVANCE = 0.4
const FILTERS = [
  { key: "", label: "All" },
  { key: "fashion", label: "Fashion" },
  { key: "bollywood", label: "Bollywood" },
  { key: "hollywood", label: "Hollywood" },
  { key: "runway", label: "Runway" },
] as const

export default function NewsPage({ searchParams }: PageProps<"/news">) {
  return (
    <div className="container mx-auto space-y-10 px-4 py-12 md:px-8">
      <header className="max-w-3xl space-y-3">
        <p className="eyebrow text-muted-foreground">Fresh from the press</p>
        <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">News</h1>
        <p className="text-lg text-muted-foreground">
          Every fashion story TrendScope has read, newest first, with a short AI summary and the trends it found. Each one links to the original article.
        </p>
      </header>
      <Suspense fallback={<NewsSkeleton />}>
        {searchParams.then((sp) => {
          const vertical = typeof sp.vertical === "string" && FILTERS.some((f) => f.key === sp.vertical) ? sp.vertical : ""
          const page = Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1)
          return <Feed vertical={vertical} page={page} />
        })}
      </Suspense>
    </div>
  )
}

const href = (vertical: string, page = 1) => {
  const q = new URLSearchParams()
  if (vertical) q.set("vertical", vertical)
  if (page > 1) q.set("page", String(page))
  const s = q.toString()
  return s ? `/news?${s}` : "/news"
}

async function Feed({ vertical, page }: { vertical: string; page: number }) {
  const q = new URLSearchParams({
    skip: String((page - 1) * PER_PAGE), limit: String(PER_PAGE), status: "processed",
    exclude_duplicates: "true", min_relevance: String(MIN_RELEVANCE),
  })
  if (vertical) q.set("vertical", vertical)
  const data = await getJSON<{ items: Article[]; total: number }>(`/api/articles/?${q}`)
  if (!data) return <ApiUnavailable />

  const pages = Math.max(1, Math.ceil(data.total / PER_PAGE))
  const [lead, ...rest] = page === 1 ? data.items : [undefined, ...data.items]
  const stories = rest.filter((a): a is Article => !!a)
  const withPhoto = stories.filter((a) => a.image_url)
  const textOnly = stories.filter((a) => !a.image_url)

  return (
    <div className="space-y-10">
      {/* Filters: horizontal scroll on phones */}
      <nav aria-label="Filter stories" className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {FILTERS.map((f) => (
          <Link key={f.key} href={href(f.key)} aria-current={f.key === vertical ? "page" : undefined}
            className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm ring-1 transition-colors duration-200",
              f.key === vertical ? "bg-foreground text-background ring-foreground" : "ring-foreground/15 hover:bg-muted")}>
            {f.label}
          </Link>
        ))}
        <span className="ml-auto hidden shrink-0 text-sm tabular-nums text-muted-foreground sm:block">{data.total.toLocaleString()} stories</span>
      </nav>

      {data.items.length === 0 && <p className="text-muted-foreground">No stories here yet.</p>}

      {lead && <LeadStory article={lead} />}

      {/* Stories with a photo as cards; the rest as a compact headline list, so there are no empty image boxes */}
      {withPhoto.length > 0 && (
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {withPhoto.map((a) => <ArticleCard key={a.id} article={a} />)}
        </div>
      )}
      {textOnly.length > 0 && (
        <section className="space-y-4">
          <h2 className="eyebrow text-muted-foreground">More stories</h2>
          <ul className="grid gap-x-10 divide-y divide-foreground/[0.08] md:grid-cols-2 md:divide-y-0">
            {textOnly.map((a) => <TextStory key={a.id} article={a} />)}
          </ul>
        </section>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-4 border-t border-foreground/10 pt-6 text-sm">
          {page > 1
            ? <Link href={href(vertical, page - 1)} className="inline-flex items-center gap-1.5 font-medium hover:underline"><ArrowLeft className="size-4" /> Newer</Link>
            : <span />}
          <span className="tabular-nums text-muted-foreground">Page {page} of {pages}</span>
          {page < pages
            ? <Link href={href(vertical, page + 1)} className="inline-flex items-center gap-1.5 font-medium hover:underline">Older <ArrowRight className="size-4" /></Link>
            : <span />}
        </nav>
      )}
    </div>
  )
}

/** The newest story, given a large image and its full summary */
function LeadStory({ article: a }: { article: Article }) {
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="group grid gap-6 md:grid-cols-[1.3fr_1fr] md:items-center md:gap-10">
      <div className="photo-edge relative aspect-[16/10] overflow-hidden rounded-2xl bg-muted">
        {a.image_url && (
          <PublisherImage src={a.image_url} alt="" fetchPriority="high"
            className="h-full w-full object-cover object-[50%_25%] transition-transform duration-700 ease-out-expo group-hover:scale-[1.03]" />
        )}
      </div>
      <div className="space-y-4">
        <p className="eyebrow text-muted-foreground">Latest · {a.category}</p>
        <h2 className="font-serif text-3xl font-semibold leading-tight md:text-4xl">
          <span className="link-reveal">{a.title}</span> <ExternalLink className="inline size-4 text-muted-foreground" aria-hidden />
        </h2>
        {a.ai_summary && <p className="text-base leading-relaxed text-muted-foreground md:text-lg">{a.ai_summary}</p>}
        {!!a.ai_trends?.length && (
          <p className="text-sm font-medium text-foreground/70">
            {a.ai_trends.slice(0, 4).map((t) => `#${t.name.replace(/\s+/g, "")}`).join("  ")}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{a.source_name} · <TimeAgo iso={a.published_at} /></p>
      </div>
    </a>
  )
}

function TextStory({ article: a }: { article: Article }) {
  return (
    <li className="border-foreground/[0.08] py-4 md:border-b">
      <a href={a.url} target="_blank" rel="noreferrer" className="group block space-y-1.5">
        <p className="eyebrow text-muted-foreground">{a.category}</p>
        <p className="font-serif text-lg font-semibold leading-snug"><span className="link-reveal">{a.title}</span></p>
        {a.ai_summary && <p className="line-clamp-2 text-sm text-muted-foreground">{a.ai_summary}</p>}
        <p className="text-xs text-muted-foreground">{a.source_name} · <TimeAgo iso={a.published_at} /></p>
      </a>
    </li>
  )
}

function NewsSkeleton() {
  return (
    <div className="space-y-10">
      <div className="h-9 w-80 max-w-full animate-pulse rounded-full bg-muted" />
      <div className="aspect-[16/10] max-h-96 w-full animate-pulse rounded-2xl bg-muted md:w-3/5" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />)}
      </div>
    </div>
  )
}
