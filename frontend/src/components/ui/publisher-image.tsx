"use client"

import { useState } from "react"
import { Monogram } from "@/components/brand/wordmark"

/** A publisher's photo that falls back to the TrendScope mark when the link is broken, instead of an empty box. */
export function PublisherImage({ src, alt = "", className, loading = "lazy", fetchPriority }: {
  src: string
  alt?: string
  className?: string
  loading?: "lazy" | "eager"
  fetchPriority?: "high" | "low" | "auto"
}) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
        <Monogram className="size-9" />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- publisher images come from arbitrary hosts
    <img src={src} alt={alt} loading={loading} fetchPriority={fetchPriority} onError={() => setBroken(true)} className={className} />
  )
}
