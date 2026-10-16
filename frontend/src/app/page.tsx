import { Suspense } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { StatusBadge } from "@/components/trends/status-badge";
import { TrendCard } from "@/components/trends/trend-card";
import { ApiUnavailable, TrendGridSkeleton } from "@/components/trends/trend-grid";
import { ArticleCard } from "@/components/trends/article-card";
import { formatGrowth, isDown, getJSON, type HomeData } from "@/lib/trends";

export default function Home() {
  return (
    <div className="flex flex-col gap-16 pb-16">
      {/* Hero Section */}
      <section className="container mx-auto px-4 md:px-8 pt-20 pb-4 flex flex-col items-center text-center space-y-8">
        <h1 className="font-serif text-5xl md:text-7xl font-bold tracking-tight max-w-4xl leading-tight">
          Discover What&apos;s Trending <br className="hidden md:block"/> Before It Becomes Mainstream.
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed">
          AI-powered fashion intelligence from thousands of signals across fashion, celebrity culture, brands and global media.
        </p>
        <div className="flex gap-4 pt-4">
          <Link href="/trending" className={cn(buttonVariants({ size: "lg" }), "rounded-full px-8")}>Explore Trends</Link>
          <Link href="/radar" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "rounded-full px-8")}>View Trend Radar</Link>
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
      <section className="bg-muted/30 py-8 border-y">
        <div className="container mx-auto px-4 md:px-8">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 className="text-sm font-bold tracking-widest text-muted-foreground uppercase">What&apos;s Trending</h2>
            <p className="text-xs text-muted-foreground">
              {data.stats.trends} trends from {data.stats.articles.toLocaleString()} stories across {data.stats.sources} sources
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {data.trending.map((trend) => {
              const down = isDown(trend);
              return (
                <Link key={trend.id} href={`/trends/${trend.slug}`} className="group flex flex-col gap-1">
                  <span className="font-serif text-lg font-semibold group-hover:underline">{trend.name}</span>
                  <div className={cn("flex items-center gap-2 text-sm font-medium", down ? "text-slate-500" : "text-green-600")}>
                    <span className="tabular-nums">{Math.round(trend.trend_score)}</span>
                    {down ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
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
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-3xl font-bold">Trend Radar</h2>
          <Link href="/trending" className="text-sm font-medium hover:underline flex items-center gap-1">
            View All <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {data.radar.map((trend) => <TrendCard key={trend.id} trend={trend} />)}
        </div>
      </section>

      {/* Celebrity Style */}
      {data.celebrities.length > 0 && (
        <section className="container mx-auto px-4 md:px-8 space-y-8">
          <h2 className="font-serif text-3xl font-bold">Celebrity Style</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {data.celebrities.slice(0, 8).map((celeb) => (
              <a key={celeb.name} href={celeb.url ?? undefined} target="_blank" rel="noreferrer" className="group space-y-3">
                <div className="aspect-[3/4] bg-muted rounded-xl overflow-hidden">
                  {celeb.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element -- publisher images come from arbitrary hosts
                    <img src={celeb.image_url} alt={celeb.headline ?? celeb.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif text-lg font-medium">{celeb.name}</h3>
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
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-3xl font-bold">Emerging Trends</h2>
          <Link href="/emerging" className="text-sm font-medium hover:underline flex items-center gap-1">
            View All <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="divide-y rounded-xl ring-1 ring-foreground/10">
          {data.emerging.map((trend) => (
            <Link key={trend.id} href={`/trends/${trend.slug}`}
              className="flex items-center justify-between gap-4 p-6 hover:bg-muted/50 transition-colors">
              <div className="flex min-w-0 items-center gap-3">
                <span className="truncate font-serif text-lg font-medium">{trend.name}</span>
                <StatusBadge status={trend.status} className="hidden sm:inline-flex" />
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className="hidden text-sm text-muted-foreground sm:inline">{formatGrowth(trend.growth_pct, trend.status)}</span>
                <div className="hidden md:block w-32 h-2 bg-muted rounded-full overflow-hidden" title="Momentum">
                  <div className="h-full bg-primary" style={{ width: `${trend.momentum_score}%` }} />
                </div>
                <span className="font-medium text-sm w-8 text-right tabular-nums">{Math.round(trend.trend_score)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Latest Fashion Intelligence */}
      {data.latest.length > 0 && (
        <section className="container mx-auto px-4 md:px-8 space-y-8">
          <h2 className="font-serif text-3xl font-bold">Latest Fashion Intelligence</h2>
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
