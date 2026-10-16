import { TimeAgo } from "@/components/trends/time-ago"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ExternalLink } from "lucide-react"
import { getJSON, type EntityDetail, type EntityKind } from "@/lib/trends"

const COUNTRY = new Intl.DisplayNames(["en"], { type: "region" })

export async function EntityDetailView({ kind, slug }: { kind: EntityKind; slug: string }) {
  const base = kind === "celebrity" ? "celebrities" : "brands"
  const entity = await getJSON<EntityDetail>(`/api/${base}/${encodeURIComponent(slug)}`)
  if (!entity) notFound()

  const relatedBase = kind === "celebrity" ? "/brands" : "/celebrities"
  const facts = [
    entity.known_for,
    entity.country ? COUNTRY.of(entity.country) : null,
    entity.vertical ? entity.vertical[0].toUpperCase() + entity.vertical.slice(1) : null,
  ].filter(Boolean)

  return (
    <div className="mt-6 space-y-14">
      <header className="grid gap-8 md:grid-cols-[280px_1fr] md:items-end">
        <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-muted">
          {entity.image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- publisher images come from arbitrary hosts
            <img src={entity.image_url} alt={entity.image_headline ?? entity.name} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="eyebrow text-muted-foreground">{facts.join(" · ")}</p>
            <h1 className="font-serif text-5xl font-bold tracking-tight md:text-6xl">{entity.name}</h1>
          </div>
          <dl className="flex flex-wrap gap-x-10 gap-y-4">
            <Fact label="Influence score" value={Math.round(entity.influence_score)} />
            <Fact label="Fashion stories (30d)" value={entity.fashion_stories_30d} />
            <Fact label="All stories" value={entity.stories_total} />
          </dl>
          <p className="text-xs text-muted-foreground">
            Influence ranks fashion coverage against every other {kind}. Photo from their latest fashion story.
          </p>
        </div>
      </header>

      <div className="grid gap-12 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-12">
          {entity.top_trends.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-serif text-2xl font-semibold tracking-tight">
                {kind === "celebrity" ? "What they're influencing" : "Trends they're part of"}
              </h2>
              <div className="flex flex-wrap gap-2">
                {entity.top_trends.map((t) => (
                  <Link key={t.slug} href={`/trends/${t.slug}`}
                    className="rounded-full px-4 py-2 text-sm ring-1 ring-foreground/15 transition-colors duration-200 hover:bg-muted">
                    {t.name} {t.count > 1 && <span className="text-muted-foreground">· {t.count}</span>}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {entity.looks.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-serif text-2xl font-semibold tracking-tight">{kind === "celebrity" ? "Recent looks" : "Recent moments"}</h2>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {entity.looks.map((a) => (
                  <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="group space-y-2">
                    <div className="aspect-[3/4] overflow-hidden rounded-xl bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element -- publisher images come from arbitrary hosts */}
                      <img src={a.image_url ?? ""} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    </div>
                    <p className="line-clamp-2 text-xs group-hover:underline">{a.title}</p>
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-4">
            <h2 className="font-serif text-2xl font-semibold tracking-tight">Coverage</h2>
            <ul className="divide-y rounded-xl shadow-soft ring-1 ring-foreground/10">
              {entity.articles.map((a) => (
                <li key={a.id} className="space-y-1 p-4">
                  <a href={a.url} target="_blank" rel="noreferrer" className="font-medium leading-snug hover:underline">
                    {a.title} <ExternalLink className="inline size-3 text-muted-foreground" />
                  </a>
                  {a.ai_summary && <p className="line-clamp-2 text-sm text-muted-foreground">{a.ai_summary}</p>}
                  <p className="text-xs text-muted-foreground">{a.source_name} · <TimeAgo iso={a.published_at} /></p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {entity.related.length > 0 && (
          <aside className="space-y-3">
            <h2 className="font-serif text-2xl font-semibold tracking-tight">{kind === "celebrity" ? "Brands worn & mentioned" : "Celebrities linked"}</h2>
            <ul className="space-y-2">
              {entity.related.map((r) => (
                <li key={r.slug} className="flex justify-between text-sm">
                  <Link href={`${relatedBase}/${r.slug}`} className="hover:underline">{r.name}</Link>
                  <span className="tabular-nums text-muted-foreground">{r.count}</span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-serif text-4xl font-bold tabular-nums">{value}</dd>
    </div>
  )
}

export function EntitySkeleton() {
  return (
    <div className="mt-6 grid animate-pulse gap-8 md:grid-cols-[280px_1fr]" aria-label="Loading">
      <div className="aspect-[3/4] rounded-2xl bg-muted" />
      <div className="space-y-4 self-end"><div className="h-14 w-2/3 rounded bg-muted" /><div className="h-10 w-1/2 rounded bg-muted" /></div>
    </div>
  )
}
