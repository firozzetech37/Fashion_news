import { Suspense } from "react"
import { HeroSlideshow, type HeroSlide } from "@/components/home/hero-slideshow"
import { WIDE_PHOTOS, type HeroPhoto } from "@/components/vertical/hero-photos"
import { THEMES } from "@/components/vertical/vertical-page"
import { getJSON, type HomeData, type Vertical, type VerticalData } from "@/lib/trends"

const SECTIONS: Vertical[] = ["fashion", "bollywood", "hollywood", "runway"]

/**
 * Full-screen editorial opener in the manner of a lookbook: one page per section of the site, each a
 * photo torn in two (colour left, black-and-white right) with the section's info card over it. The
 * frame and corner labels prerender; the pages stream in with the live numbers.
 */
export function EditorialHero() {
  return (
    <section className="relative isolate h-[calc(100svh-4rem)] min-h-[640px] overflow-hidden bg-neutral-950 text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4 md:p-8 lg:px-12">
        <div className="space-y-1">
          <p className="bracket-label">[ TrendScope ]</p>
          <p className="bracket-label text-white/70">[ Where data meets style ]</p>
        </div>
        <p className="bracket-label hidden text-white/70 sm:block">[ AI fashion intelligence · updated every 30 min ]</p>
      </div>
      <h1 className="sr-only">TrendScope: AI fashion intelligence</h1>

      <Suspense fallback={<div className="h-full animate-pulse bg-neutral-900" />}>
        <Slides />
      </Suspense>
    </section>
  )
}

async function Slides() {
  const [home, ...verticals] = await Promise.all([
    getJSON<HomeData>("/api/home/"),
    ...SECTIONS.map((v) => getJSON<VerticalData>(`/api/verticals/${v}`)),
  ])

  const slides: HeroSlide[] = [
    {
      key: "home", eyebrow: "This week's signals", title: "Trending now", href: "/trending", cta: "See all trends",
      tagline: "What's gaining ground this week across fashion, celebrity culture, brands and global media.",
      top: topOf(home?.trending[0]),
      stats: home ? [
        { label: "Trends", value: String(home.stats.trends) },
        { label: "Stories", value: home.stats.articles.toLocaleString() },
        { label: "Sources", value: String(home.stats.sources) },
      ] : [],
      photo: photoOf(WIDE_PHOTOS.home),
    },
    ...SECTIONS.map((v, i): HeroSlide => {
      const data = verticals[i]
      return {
        key: v, eyebrow: THEMES[v].eyebrow, title: THEMES[v].title, href: `/${v}`, cta: `See ${THEMES[v].title}`, tagline: THEMES[v].tagline,
        top: topOf(data?.trends[0]),
        stats: data ? [
          { label: "Trends", value: String(data.stats.trends) },
          { label: "Stories", value: data.stats.stories.toLocaleString() },
        ] : [],
        photo: photoOf(WIDE_PHOTOS[v]),
      }
    }),
  ]
  return <HeroSlideshow slides={slides} />
}

const topOf = (t?: { name: string; slug: string; trend_score: number }) =>
  t ? { name: t.name, slug: t.slug, score: Math.round(t.trend_score) } : null

const photoOf = (p: HeroPhoto): HeroSlide["photo"] =>
  ({ src: p.src, alt: p.alt, focus: p.focus ?? "50% 50%", credit: p.credit })
