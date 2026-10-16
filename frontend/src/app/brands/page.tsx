import { Suspense } from "react"
import type { Metadata } from "next"
import { EntityDirectory } from "@/components/entities/entity-directory"
import { TrendGridSkeleton } from "@/components/trends/trend-grid"
import { SectionSearch } from "@/components/vertical/section-search"

export const metadata: Metadata = { title: "Brands | TrendScope" }

export default function BrandsPage() {
  return (
    <div className="container mx-auto space-y-10 px-4 py-12 md:px-8">
      <header className="max-w-2xl space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Brand intelligence</p>
        <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">Brands</h1>
        <p className="text-muted-foreground">Labels ranked by fashion coverage, with the trends and celebrities they&apos;re linked to.</p>
      </header>
      <div className="-mx-4 md:-mx-8"><SectionSearch vertical="fashion" label="Search brands" /></div>
      <Suspense fallback={<TrendGridSkeleton />}>
        <EntityDirectory kind="brand" />
      </Suspense>
    </div>
  )
}
