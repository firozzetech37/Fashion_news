import { Suspense } from "react"
import type { Metadata } from "next"
import { TrendGrid, TrendGridSkeleton } from "@/components/trends/trend-grid"

export const metadata: Metadata = { title: "Emerging Trends" }

export default function EmergingPage() {
  return (
    <div className="container mx-auto space-y-10 px-4 py-12 md:px-8">
      <header className="max-w-2xl space-y-2">
        <p className="eyebrow text-muted-foreground">Early signals</p>
        <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">Emerging trends</h1>
        <p className="text-muted-foreground">
          New and rising signals, ranked by momentum. These are early: few mentions so far, but growing.
        </p>
      </header>
      <Suspense fallback={<TrendGridSkeleton count={12} />}>
        <TrendGrid path="/api/trends/?status=emerging,rising&sort=momentum&limit=32" empty="No emerging trends yet." />
      </Suspense>
    </div>
  )
}
