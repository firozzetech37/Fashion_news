import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { cn } from "cn"
import { TrendGrid, TrendGridSkeleton } from "@/components/trends/trend-grid"

export const metadata: Metadata = { title: "Trending" }

const VERTICALS = [["", "All"], ["fashion", "Fashion"], ["bollywood", "Bollywood"], ["hollywood", "Hollywood"], ["runway", "Runway"]]
const TYPES = [
  ["", "All types"], ["color", "Colors"], ["clothing", "Clothing"], ["fabric", "Fabrics"], ["accessory", "Accessories"],
  ["footwear", "Footwear"], ["aesthetic", "Aesthetics"], ["makeup", "Beauty"], ["jewelry", "Jewelry"], ["pattern", "Patterns"],
]

export default function TrendingPage({ searchParams }: PageProps<"/trending">) {
  return (
    <div className="container mx-auto space-y-10 px-4 py-12 md:px-8">
      <header className="max-w-2xl space-y-2">
        <p className="eyebrow text-muted-foreground">Trend radar</p>
        <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">What&apos;s trending</h1>
        <p className="text-muted-foreground">
          Every trend is scored 0–100 from mention growth, source diversity, celebrity influence, brand adoption,
          social signals and fashion week presence.
        </p>
      </header>
      <Suspense fallback={<TrendGridSkeleton />}>
        {searchParams.then((sp) => {
          const vertical = typeof sp.vertical === "string" ? sp.vertical : ""
          const type = typeof sp.type === "string" ? sp.type : ""
          const filters = new URLSearchParams({ ...(vertical && { vertical }), ...(type && { type }) }).toString()
          return (
            <div className="space-y-10">
              <div className="space-y-3">
                <FilterRow options={VERTICALS} current={vertical} param="vertical" other={{ type }} label="Filter by vertical" />
                <FilterRow options={TYPES} current={type} param="type" other={{ vertical }} label="Filter by type" />
              </div>
              <section className="space-y-4">
                <h2 className="font-serif text-2xl font-semibold tracking-tight">Top trends</h2>
                <TrendGrid path={`/api/trends/?status=trending,peak,rising,emerging&sort=score&limit=24&${filters}`} empty="No trends match these filters yet." />
              </section>
              <section className="space-y-4">
                <h2 className="font-serif text-2xl font-semibold tracking-tight">Cooling off</h2>
                <TrendGrid path={`/api/trends/?status=declining&sort=score&limit=8&${filters}`} empty="Nothing is declining right now." />
              </section>
            </div>
          )
        })}
      </Suspense>
    </div>
  )
}

function FilterRow({ options, current, param, other, label }: {
  options: string[][]; current: string; param: string; other: Record<string, string>; label: string
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {options.map(([value, text]) => {
        const qs = new URLSearchParams(Object.fromEntries(Object.entries({ ...other, [param]: value }).filter(([, v]) => v))).toString()
        const active = current === value
        return (
          <Link key={text} href={qs ? `/trending?${qs}` : "/trending"} aria-current={active ? "page" : undefined}
            className={cn("rounded-full px-3.5 py-1 text-sm ring-1 ring-foreground/15", active ? "bg-foreground text-background" : "hover:bg-muted")}>
            {text}
          </Link>
        )
      })}
    </nav>
  )
}
