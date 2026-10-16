import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { Search } from "lucide-react"
import { EntityGrid } from "@/components/entities/entity-card"
import { ArticleCard } from "@/components/trends/article-card"
import { TrendCard } from "@/components/trends/trend-card"
import { ApiUnavailable, TrendGridSkeleton } from "@/components/trends/trend-grid"
import { getJSON, type SearchResults } from "@/lib/trends"

export const metadata: Metadata = { title: "Search" }

const EXAMPLES = ["brown saree", "red carpet gowns", "sneakers", "k-beauty", "indian bridal fashion", "Zendaya"]

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="container mx-auto space-y-10 px-4 py-12 md:px-8">
      <Suspense fallback={<SearchForm />}>
        {searchParams.then(({ q }) => {
          const query = typeof q === "string" ? q.trim() : ""
          return (
            <>
              <SearchForm query={query} />
              {query.length >= 2 ? (
                <Suspense key={query} fallback={<TrendGridSkeleton count={4} />}>
                  <Results query={query} />
                </Suspense>
              ) : (
                <Examples />
              )}
            </>
          )
        })}
      </Suspense>
    </div>
  )
}

function SearchForm({ query = "" }: { query?: string }) {
  return (
    <form action="/search" role="search" className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-center font-serif text-4xl font-bold tracking-tight">Search TrendScope</h1>
      <div className="flex items-center gap-2 rounded-full px-5 py-3 ring-1 ring-foreground/20 focus-within:ring-2 focus-within:ring-foreground">
        <Search className="size-5 shrink-0 text-muted-foreground" />
        <input
          name="q" defaultValue={query} autoFocus minLength={2} maxLength={200}
          placeholder="Trends, celebrities, brands, styles…" aria-label="Search"
          className="w-full bg-transparent text-lg outline-none placeholder:text-muted-foreground"
        />
      </div>
    </form>
  )
}

function Examples() {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {EXAMPLES.map((e) => (
        <Link key={e} href={`/search?q=${encodeURIComponent(e)}`} className="rounded-full px-4 py-1.5 text-sm ring-1 ring-foreground/15 transition-colors duration-200 hover:bg-muted">
          {e}
        </Link>
      ))}
    </div>
  )
}

async function Results({ query }: { query: string }) {
  const data = await getJSON<SearchResults>(`/api/search/?q=${encodeURIComponent(query)}`)
  if (!data) return <ApiUnavailable />
  const empty = !data.trends.length && !data.celebrities.length && !data.brands.length && !data.articles.length
  if (empty) return <p className="text-center text-muted-foreground">No results for “{query}”. Try a broader term.</p>

  return (
    <div className="space-y-14">
      {!data.semantic && (
        <p className="text-center text-xs text-muted-foreground">Showing keyword matches only (semantic search is temporarily unavailable).</p>
      )}
      {data.trends.length > 0 && (
        <ResultSection title="Trends" count={data.trends.length}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.trends.map((t) => <TrendCard key={t.id} trend={t} />)}
          </div>
        </ResultSection>
      )}
      {data.celebrities.length > 0 && (
        <ResultSection title="Celebrities" count={data.celebrities.length}>
          <EntityGrid entities={data.celebrities} empty="" />
        </ResultSection>
      )}
      {data.brands.length > 0 && (
        <ResultSection title="Brands" count={data.brands.length}>
          <EntityGrid entities={data.brands} empty="" />
        </ResultSection>
      )}
      {data.articles.length > 0 && (
        <ResultSection title="Stories" count={data.articles.length}>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {data.articles.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </ResultSection>
      )}
    </div>
  )
}

function ResultSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="space-y-5">
      <h2 className="font-serif text-2xl font-semibold tracking-tight">{title} <span className="text-base font-normal text-muted-foreground">{count}</span></h2>
      {children}
    </section>
  )
}
