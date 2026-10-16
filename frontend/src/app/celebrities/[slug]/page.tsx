import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { EntityDetailView, EntitySkeleton } from "@/components/entities/entity-detail"

export const metadata: Metadata = { title: "Celebrities | TrendScope" }

export default function Page({ params }: PageProps<"/celebrities/[slug]">) {
  return (
    <div className="container mx-auto px-4 py-10 md:px-8">
      <Link href="/celebrities" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All celebrities
      </Link>
      <Suspense fallback={<EntitySkeleton />}>
        {params.then(({ slug }) => <EntityDetailView kind="celebrity" slug={slug} />)}
      </Suspense>
    </div>
  )
}
