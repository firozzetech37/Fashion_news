import { Suspense } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { cn } from "cn"
import { EntityGrid } from "@/components/entities/entity-card"
import { SectionSearch } from "@/components/vertical/section-search"
import { ArticleCard } from "@/components/trends/article-card"
import { StatusBadge } from "@/components/trends/status-badge"
import { TrendCard } from "@/components/trends/trend-card"
import { ApiUnavailable, TrendGridSkeleton } from "@/components/trends/trend-grid"
import { formatGrowth, getJSON, type Vertical, type VerticalData } from "@/lib/trends"

const THEMES: Record<Vertical, { eyebrow: string; title: string; tagline: string; hero: string; muted: string; peopleTitle: string }> = {
  fashion: {
    eyebrow: "Fashion intelligence", title: "Fashion",
    tagline: "Runway to street: the colors, silhouettes and labels gaining ground across the fashion press.",
    hero: "bg-muted/40", muted: "text-muted-foreground", peopleTitle: "Brands to watch",
  },
  bollywood: {
    eyebrow: "Bollywood style", title: "Bollywood",
    tagline: "Saris, couture and red carpets: what India's biggest stars are wearing, and what it's starting.",
    hero: "bg-gradient-to-br from-amber-50 via-rose-50 to-orange-100/60", muted: "text-stone-600", peopleTitle: "Trending celebrities",
  },
  hollywood: {
    eyebrow: "Hollywood style", title: "Hollywood",
    tagline: "Red carpets, street style and premieres: the looks shaping global celebrity fashion.",
    hero: "bg-neutral-950 text-white", muted: "text-neutral-400", peopleTitle: "Trending celebrities",
  },
  runway: {
    eyebrow: "Runway & designers", title: "Runway",
    tagline: "Collections and fashion week signals: where trends start before they reach the street.",
    hero: "bg-stone-100", muted: "text-stone-600", peopleTitle: "Labels on the runway",
  },
}

export function VerticalPage({ vertical }: { vertical: Vertical }) {
  const theme = THEMES[vertical]
  return (
    <div className="flex flex-col gap-16 pb-16">
      <section className={cn("py-16 md:py-24", theme.hero)}>
        <div className="container mx-auto max-w-4xl space-y-4 px-4 md:px-8">
          <p className={cn("text-xs font-bold uppercase tracking-widest", theme.muted)}>{theme.eyebrow}</p>
          <h1 className="font-serif text-5xl font-bold tracking-tight md:text-7xl">{theme.title}</h1>
          <p className={cn("max-w-2xl text-lg leading-relaxed", theme.muted)}>{theme.tagline}</p>
        </div>
      </section>
      <SectionSearch vertical={vertical} label={`Search ${theme.title}`} />
      <Suspense fallback={<div className="container mx-auto px-4 md:px-8"><TrendGridSkeleton count={4} /></div>}>
        <VerticalSections vertical={vertical} peopleTitle={theme.peopleTitle} />
      </Suspense>
    </div>
  )
}

async function VerticalSections({ vertical, peopleTitle }: { vertical: Vertical; peopleTitle: string }) {
  const data = await getJSON<VerticalData>(`/api/verticals/${vertical}`)
  if (!data) return <div className="container mx-auto px-4 md:px-8"><ApiUnavailable /></div>
  const peopleHref = data.entity_kind === "celebrity" ? `/celebrities?vertical=${vertical}` : "/brands"

  return (
    <>
      <Section title="Trending now" href={`/trending?vertical=${vertical}`}
        subtitle={`${data.stats.trends} trends from ${data.stats.stories.toLocaleString()} stories`}>
        {data.trends.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.trends.map((t) => <TrendCard key={t.id} trend={t} />)}
          </div>
        ) : <p className="text-muted-foreground">No trends detected yet.</p>}
      </Section>

      <Section title={peopleTitle} href={peopleHref}>
        <EntityGrid entities={data.entities} empty="No one with fashion coverage yet." />
      </Section>

      {data.emerging.length > 0 && (
        <Section title="Emerging" href={`/emerging`}>
          <div className="divide-y rounded-xl ring-1 ring-foreground/10">
            {data.emerging.map((t) => (
              <Link key={t.id} href={`/trends/${t.slug}`} className="flex items-center justify-between gap-4 p-5 hover:bg-muted/50">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="truncate font-serif text-lg">{t.name}</span>
                  <StatusBadge status={t.status} className="hidden sm:inline-flex" />
                </div>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatGrowth(t.growth_pct, t.status)} · {Math.round(t.trend_score)}
                </span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {data.stories.length > 0 && (
        <Section title="Latest looks & stories">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {data.stories.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </Section>
      )}
    </>
  )
}

function Section({ title, subtitle, href, children }: { title: string; subtitle?: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="container mx-auto space-y-6 px-4 md:px-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="flex shrink-0 items-center gap-1 text-sm font-medium hover:underline">
            View all <ArrowUpRight className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}
