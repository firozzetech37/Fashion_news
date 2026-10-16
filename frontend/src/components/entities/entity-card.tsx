import Link from "next/link"
import { cn } from "cn"
import { entityPath, type EntitySummary } from "@/lib/trends"

/** Portrait card for celebrities (photo-led) or compact card for brands. */
export function EntityCard({ entity, className }: { entity: EntitySummary; className?: string }) {
  const isCelebrity = entity.kind === "celebrity"
  return (
    <Link href={entityPath(entity)} className={cn("group block space-y-3", className)}>
      <div className={cn("photo-edge relative overflow-hidden rounded-xl bg-muted", isCelebrity ? "aspect-[3/4]" : "aspect-[4/3]")}>
        {entity.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- publisher images come from arbitrary hosts
          <img src={entity.image_url} alt={entity.image_headline ?? entity.name} loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 ease-out-expo group-hover:scale-[1.04]" />
        ) : (
          <div className="flex h-full items-center justify-center font-serif text-5xl text-muted-foreground/40">
            {entity.name.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-serif text-lg font-semibold leading-tight">
            <span className="link-reveal">{entity.name}</span>
          </h3>
          <span className="shrink-0 font-serif text-sm tabular-nums text-muted-foreground" title="Influence score">
            {Math.round(entity.influence_score)}
          </span>
        </div>
        {entity.known_for && <p className="text-xs text-muted-foreground">{entity.known_for}</p>}
        {entity.top_trends.length > 0 && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {entity.top_trends.slice(0, 3).map((t) => t.name).join(" · ")}
          </p>
        )}
      </div>
    </Link>
  )
}

export function EntityGrid({ entities, empty }: { entities: EntitySummary[]; empty: string }) {
  if (!entities.length) return <p className="text-muted-foreground">{empty}</p>
  const celeb = entities[0].kind === "celebrity"
  return (
    <div className={cn("grid gap-6", celeb ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4")}>
      {entities.map((e) => <EntityCard key={e.id} entity={e} />)}
    </div>
  )
}
