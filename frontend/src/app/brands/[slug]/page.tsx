import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { EntityDetailView, EntitySkeleton } from "@/components/entities/entity-detail"

export const metadata: Metadata = { title: "Brands" }

export default function Page({ params }: PageProps<"/brands/[slug]">) {
  return (
    <div className="container mx-auto px-4 py-10 md:px-8">
      <Link href="/brands" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All brands
      </Link>
      <Suspense fallback={<EntitySkeleton />}>
        {params.then(({ slug }) => <EntityDetailView kind="brand" slug={slug} />)}
      </Suspense>
    </div>
  )
}
