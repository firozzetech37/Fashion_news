import { Suspense } from "react"
import Image from "next/image"
import Link from "next/link"
import { cn } from "cn"
import { EntityGrid } from "@/components/entities/entity-card"
import { HERO_PHOTOS, pickHeroPhoto, type HeroPhoto } from "@/components/vertical/hero-photos"
import { SectionSearch } from "@/components/vertical/section-search"
import { ArticleCard } from "@/components/trends/article-card"
import { StatusBadge } from "@/components/trends/status-badge"
import { TrendCard } from "@/components/trends/trend-card"
import { ApiUnavailable, TrendGridSkeleton } from "@/components/trends/trend-grid"
import { SectionHeader } from "@/components/ui/section-header"
import { formatGrowth, getJSON, type Vertical, type VerticalData } from "@/lib/trends"

export const THEMES: Record<Vertical, { eyebrow: string; title: string; tagline: string; hero: string; muted: string; rule: string; peopleTitle: string }> = {
  fashion: {
    eyebrow: "Fashion intelligence", title: "Fashion",
    tagline: "Runway to street: the colors, silhouettes and labels gaining ground across the fashion press.",
    hero: "bg-muted/40", muted: "text-muted-foreground", rule: "bg-foreground/15", peopleTitle: "Brands to watch",
  },
  bollywood: {
    eyebrow: "Bollywood style", title: "Bollywood",
    tagline: "Saris, couture and red carpets: what India's biggest stars are wearing, and what it's starting.",
    hero: "bg-gradient-to-br from-amber-50 via-rose-50 to-orange-100/60", muted: "text-stone-600", rule: "bg-stone-900/15", peopleTitle: "Trending celebrities",
  },
  hollywood: {
    eyebrow: "Hollywood style", title: "Hollywood",
    tagline: "Red carpets, street style and premieres: the looks shaping global celebrity fashion.",
    hero: "bg-neutral-950 text-white", muted: "text-neutral-400", rule: "bg-white/20", peopleTitle: "Trending celebrities",
  },
  runway: {
    eyebrow: "Runway & designers", title: "Runway",
    tagline: "Collections and fashion week signals: where trends start before they reach the street.",
    hero: "bg-stone-100", muted: "text-stone-600", rule: "bg-stone-900/15", peopleTitle: "Labels on the runway",
  },
}

export function VerticalPage({ vertical }: { vertical: Vertical }) {
  const theme = THEMES[vertical]
  const photos = HERO_PHOTOS[vertical]
  return (
    <div className="flex flex-col gap-16 pb-16">
      <section className={cn("py-16 md:py-24", theme.hero)}>
        <div className={cn("container mx-auto px-4 md:px-8",
          photos ? "grid max-w-6xl items-center gap-10 md:grid-cols-[1.15fr_1fr] md:gap-16" : "max-w-4xl")}>
          <div className="space-y-5">
            <p className={cn("eyebrow flex items-center gap-3", theme.muted)}>
              <span aria-hidden className={cn("h-px w-8", theme.rule)} />
              {theme.eyebrow}
            </p>
            <h1 className="font-serif text-5xl font-bold tracking-tight md:text-7xl">{theme.title}</h1>
            <p className={cn("max-w-2xl text-lg leading-relaxed md:text-xl", theme.muted)}>{theme.tagline}</p>
          </div>
          {photos && (
            <Suspense fallback={<div className={cn(PHOTO_FRAME, "animate-pulse opacity-50", theme.rule)} />}>
              <RandomHeroPhoto photos={photos} />
            </Suspense>
          )}
        </div>
      </section>
      <SectionSearch vertical={vertical} label={`Search ${theme.title}`} />
      <Suspense fallback={<div className="container mx-auto px-4 md:px-8"><TrendGridSkeleton count={4} /></div>}>
        <VerticalSections vertical={vertical} peopleTitle={theme.peopleTitle} />
      </Suspense>
    </div>
  )
}

const PHOTO_FRAME = "relative aspect-[4/5] overflow-hidden rounded-2xl"

async function RandomHeroPhoto({ photos }: { photos: HeroPhoto[] }) {
  const photo = await pickHeroPhoto(photos)
  return (
    <div className={cn(PHOTO_FRAME, "photo-edge bg-muted shadow-soft")}>
      <Image src={photo.src} alt={photo.alt} fill placeholder="blur" loading="eager"
        sizes="(min-width: 1152px) 480px, (min-width: 768px) 45vw, 100vw" className="object-cover object-[50%_30%]" />
    </div>
  )
}

async function VerticalSections({ vertical, peopleTitle }: { vertical: Vertical; peopleTitle: string }) {
  const data = await getJSON<VerticalData>(`/api/verticals/${vertical}`)
  if (!data) return <div className="container mx-auto px-4 md:px-8"><ApiUnavailable /></div>
  const peopleHref = data.entity_kind === "celebrity" ? `/celebrities?vertical=${vertical}` : "/brands"

  return (
    <>
      <Section title="Trending now" eyebrow="This week's signals" href={`/trending?vertical=${vertical}`}
        subtitle={`${data.stats.trends} trends from ${data.stats.stories.toLocaleString()} stories`}>
        {data.trends.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.trends.map((t) => <TrendCard key={t.id} trend={t} />)}
          </div>
        ) : <p className="text-muted-foreground">No trends detected yet.</p>}
      </Section>

      <Section title={peopleTitle} eyebrow={data.entity_kind === "celebrity" ? "Who's influencing" : "Labels in the press"} href={peopleHref}>
        <EntityGrid entities={data.entities} empty="No one with fashion coverage yet." />
      </Section>

      {data.emerging.length > 0 && (
        <Section title="Emerging" eyebrow="Early signals" href={`/emerging`}>
          <div className="divide-y divide-foreground/[0.08] rounded-xl bg-card shadow-soft ring-1 ring-foreground/10">
            {data.emerging.map((t) => (
              <Link key={t.id} href={`/trends/${t.slug}`} className="group flex items-center justify-between gap-4 p-5 transition-colors duration-200 hover:bg-muted/50">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="truncate font-serif text-lg font-semibold"><span className="link-reveal">{t.name}</span></span>
                  <StatusBadge status={t.status} className="hidden sm:inline-flex" />
                </div>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {formatGrowth(t.growth_pct, t.status)} · <span className="font-serif text-base text-foreground">{Math.round(t.trend_score)}</span>
                </span>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {data.stories.length > 0 && (
        <Section title="Latest looks & stories" eyebrow="Fresh from the press">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {data.stories.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </Section>
      )}
    </>
  )
}

function Section({ title, eyebrow, subtitle, href, children }: { title: string; eyebrow?: string; subtitle?: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="container mx-auto space-y-6 px-4 md:px-8">
      <SectionHeader title={title} eyebrow={eyebrow} subtitle={subtitle} href={href} />
      {children}
    </section>
  )
}
