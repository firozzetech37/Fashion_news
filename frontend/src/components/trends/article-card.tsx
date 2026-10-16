import { TimeAgo } from "@/components/trends/time-ago"
import { Monogram } from "@/components/brand/wordmark"
import type { Article } from "@/lib/api"

export function ArticleCard({ article: a }: { article: Article }) {
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="group block space-y-3">
      <div className="photo-edge relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
        {a.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- publisher images come from arbitrary hosts
          <img src={a.image_url} alt="" loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 ease-out-expo group-hover:scale-[1.04]" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/30">
            <Monogram className="size-10" />
          </div>
        )}
      </div>
      <p className="eyebrow text-muted-foreground">{a.category}</p>
      <h3 className="font-serif text-xl font-semibold leading-snug">
        <span className="link-reveal">{a.title}</span>
      </h3>
      {a.ai_summary && <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">{a.ai_summary}</p>}
      {!!a.ai_trends?.length && (
        <p className="text-xs font-medium text-foreground/70">
          {a.ai_trends.slice(0, 3).map((t) => `#${t.name.replace(/\s+/g, "")}`).join("  ")}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{a.source_name} · <TimeAgo iso={a.published_at} /></p>
    </a>
  )
}
