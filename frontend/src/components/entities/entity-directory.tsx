import Link from "next/link"
import { cn } from "cn"
import { ApiUnavailable } from "@/components/trends/trend-grid"
import { getJSON, type EntityKind, type EntitySummary } from "@/lib/trends"
import { EntityGrid } from "./entity-card"

const FILTERS = [
  { value: "", label: "All" },
  { value: "bollywood", label: "Bollywood" },
  { value: "hollywood", label: "Hollywood" },
]

export async function EntityDirectory({ kind, vertical }: { kind: EntityKind; vertical?: string }) {
  const base = kind === "celebrity" ? "celebrities" : "brands"
  const qs = new URLSearchParams({ limit: "48", ...(vertical ? { vertical } : {}) })
  const data = await getJSON<{ items: EntitySummary[]; total: number }>(`/api/${base}/?${qs}`)

  return (
    <div className="space-y-8">
      {kind === "celebrity" && (
        <nav className="flex gap-2" aria-label="Filter by industry">
          {FILTERS.map((f) => (
            <Link key={f.label} href={f.value ? `/celebrities?vertical=${f.value}` : "/celebrities"}
              aria-current={(vertical ?? "") === f.value ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm ring-1 ring-foreground/15",
                (vertical ?? "") === f.value ? "bg-foreground text-background" : "hover:bg-muted",
              )}>
              {f.label}
            </Link>
          ))}
        </nav>
      )}
      {data ? <EntityGrid entities={data.items} empty="Nobody with fashion coverage yet." /> : <ApiUnavailable />}
    </div>
  )
}
