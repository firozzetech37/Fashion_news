import { TimeAgo } from "@/components/trends/time-ago"
import type { Article } from "@/lib/api"

export function ArticleCard({ article: a }: { article: Article }) {
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="group space-y-3">
      <div className="aspect-[4/3] overflow-hidden rounded-xl bg-muted">
        {a.image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- publisher images come from arbitrary hosts
          <img src={a.image_url} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        )}
      </div>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{a.category}</p>
      <h3 className="font-serif text-xl font-semibold leading-snug group-hover:underline">{a.title}</h3>
      {a.ai_summary && <p className="text-sm text-muted-foreground line-clamp-3">{a.ai_summary}</p>}
      {!!a.ai_trends?.length && (
        <p className="text-xs">{a.ai_trends.slice(0, 3).map((t) => `#${t.name.replace(/\s+/g, "")}`).join(" ")}</p>
      )}
      <p className="text-xs text-muted-foreground">{a.source_name} · <TimeAgo iso={a.published_at} /></p>
    </a>
  )
}
