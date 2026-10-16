import { Suspense } from "react"
import type { Metadata } from "next"
import { EntityDirectory } from "@/components/entities/entity-directory"
import { TrendGridSkeleton } from "@/components/trends/trend-grid"

export const metadata: Metadata = { title: "Celebrities | TrendScope" }

export default function CelebritiesPage({ searchParams }: PageProps<"/celebrities">) {
  return (
    <div className="container mx-auto space-y-10 px-4 py-12 md:px-8">
      <header className="max-w-2xl space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Celebrity intelligence</p>
        <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">Celebrity style</h1>
        <p className="text-muted-foreground">Ranked by fashion influence: how often their style makes fashion news, and the trends it&apos;s tied to.</p>
      </header>
      <Suspense fallback={<TrendGridSkeleton />}>
        {searchParams.then(({ vertical }) => (
          <EntityDirectory kind="celebrity" vertical={typeof vertical === "string" ? vertical : undefined} />
        ))}
      </Suspense>
    </div>
  )
}
