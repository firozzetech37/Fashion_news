import { Suspense } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/trends/status-badge";
import { TrendCard } from "@/components/trends/trend-card";
import { ApiUnavailable, TrendGridSkeleton } from "@/components/trends/trend-grid";
import { ArticleCard } from "@/components/trends/article-card";
import { formatGrowth, isDown, getJSON, type HomeData } from "@/lib/trends";

export default function Home() {
  return (
    <div className="relative isolate flex flex-col gap-16 pb-16">
      {/* Soft neutral glow behind the hero (uses the theme's muted grey, nothing new) */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(60%_70%_at_50%_0%,var(--color-muted)_0%,transparent_70%)]" />

      {/* Hero Section */}
      <section className="container mx-auto px-4 md:px-8 pt-20 pb-4 flex flex-col items-center text-center space-y-8">
        <p className="eyebrow inline-flex items-center gap-2.5 text-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
          AI fashion intelligence<span className="hidden sm:inline"> · updated every 30 minutes</span>
        </p>
        <h1 className="font-serif text-5xl md:text-7xl font-bold tracking-tight max-w-4xl leading-[1.05]">
          Discover What&apos;s Trending <br className="hidden md:block"/> Before It Becomes <em className="font-medium italic">Mainstream.</em>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed">
          AI-powered fashion intelligence from thousands of signals across fashion, celebrity culture, brands and global media.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link href="/trending" className={cn(buttonVariants({ size: "lg" }), "group h-11 rounded-full px-7 text-[15px] shadow-lift")}>
            Explore Trends
            <ArrowRight className="size-4 transition-transform duration-300 ease-out-expo group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <Link href="/radar" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-11 rounded-full px-7 text-[15px]")}>
            View Trend Radar
          </Link>
        </div>
      </section>

      <Suspense fallback={<HomeSkeleton />}>
        <HomeSections />
      </Suspense>
    </div>
  );
}

async function HomeSections() {
  const data = await getJSON<HomeData>("/api/home/");
  if (!data) {
    return <div className="container mx-auto px-4 md:px-8"><ApiUnavailable /></div>;
  }

  return (
    <>
      {/* What's Trending Highlights */}
      <section className="bg-muted/30 py-8 border-y border-foreground/[0.08]">
        <div className="container mx-auto px-4 md:px-8">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="eyebrow text-muted-foreground">What&apos;s Trending</h2>
            <p className="text-xs text-muted-foreground tabular-nums">
              {data.stats.trends} trends from {data.stats.articles.toLocaleString()} stories across {data.stats.sources} sources
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-0 md:divide-x md:divide-foreground/10">
            {data.trending.map((trend) => {
              const down = isDown(trend);
              return (
                <Link key={trend.id} href={`/trends/${trend.slug}`} className="group flex flex-col gap-1.5 md:px-8 md:first:pl-0 md:last:pr-0">
                  <span className="font-serif text-lg font-semibold leading-tight"><span className="link-reveal">{trend.name}</span></span>
                  <div className={cn("flex items-center gap-2 text-sm font-medium", down ? "text-slate-500" : "text-emerald-700")}>
                    <span className="font-serif text-xl tabular-nums leading-none">{Math.round(trend.trend_score)}</span>
                    {down ? <ArrowDownRight className="h-4 w-4" aria-hidden /> : <ArrowUpRight className="h-4 w-4" aria-hidden />}
                    <span className="capitalize">{trend.status}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trend Radar */}
      <section id="radar" className="container mx-auto px-4 md:px-8 space-y-8 scroll-mt-24">
        <SectionHeader eyebrow="Top signals this week" title="Trend Radar" href="/trending" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {data.radar.map((trend) => <TrendCard key={trend.id} trend={trend} />)}
        </div>
      </section>

      {/* Celebrity Style */}
      {data.celebrities.length > 0 && (
        <section className="container mx-auto px-4 md:px-8 space-y-8">
          <SectionHeader eyebrow="Who's influencing" title="Celebrity Style" href="/celebrities" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {data.celebrities.slice(0, 8).map((celeb) => (
              <a key={celeb.name} href={celeb.url ?? undefined} target="_blank" rel="noreferrer" className="group space-y-3">
                <div className="photo-edge relative aspect-[3/4] bg-muted rounded-xl overflow-hidden">
                  {celeb.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- publisher images come from arbitrary hosts
                    <img src={celeb.image_url} alt={celeb.headline ?? celeb.name} loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 ease-out-expo group-hover:scale-[1.04]" />
                  ) : (
                    <div className="flex h-full items-center justify-center font-serif text-5xl text-muted-foreground/40">
                      {celeb.name.slice(0, 1)}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif text-lg font-semibold leading-tight"><span className="link-reveal">{celeb.name}</span></h3>
                  <p className="text-xs text-muted-foreground">
                    {celeb.articles} {celeb.articles === 1 ? "story" : "stories"}
                    {celeb.trends.length > 0 && ` · ${celeb.trends.join(", ")}`}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Emerging Trends */}
      <section className="container mx-auto px-4 md:px-8 space-y-8">
        <SectionHeader eyebrow="Early signals" title="Emerging Trends" href="/emerging" />
        <div className="divide-y divide-foreground/[0.08] rounded-xl bg-card shadow-soft ring-1 ring-foreground/10">
          {data.emerging.map((trend, i) => (
            <Link key={trend.id} href={`/trends/${trend.slug}`}
              className="group flex items-center justify-between gap-4 p-6 transition-colors duration-200 hover:bg-muted/50">
              <div className="flex min-w-0 items-center gap-4">
                <span className="w-6 shrink-0 font-serif text-sm tabular-nums text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <span className="truncate font-serif text-lg font-semibold"><span className="link-reveal">{trend.name}</span></span>
                <StatusBadge status={trend.status} className="hidden sm:inline-flex" />
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className="hidden text-sm tabular-nums text-muted-foreground sm:inline">{formatGrowth(trend.growth_pct, trend.status)}</span>
                <div className="hidden md:block w-32 h-1.5 bg-muted rounded-full overflow-hidden" title="Momentum">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${trend.momentum_score}%` }} />
                </div>
                <span className="w-8 text-right font-serif text-lg tabular-nums">{Math.round(trend.trend_score)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Latest Fashion Intelligence */}
      {data.latest.length > 0 && (
        <section className="container mx-auto px-4 md:px-8 space-y-8">
          <SectionHeader eyebrow="Fresh from the press" title="Latest Fashion Intelligence" />
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {data.latest.map((a) => <ArticleCard key={a.id} article={a} />)}
          </div>
        </section>
      )}
    </>
  );
}

function HomeSkeleton() {
  return (
    <div className="container mx-auto px-4 md:px-8 space-y-8">
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <TrendGridSkeleton count={4} />
    </div>
  );
}
