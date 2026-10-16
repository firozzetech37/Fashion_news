"use client"

import { useIsClient } from "@/components/analytics/use-is-client"
import { timeAgo } from "@/lib/trends"

/**
 * Relative time ("3h ago"). Reading the clock while Next.js prerenders a page isn't allowed, so the
 * server renders a fixed date and the browser swaps in the relative label.
 */
export function TimeAgo({ iso }: { iso: string | null }) {
  const isClient = useIsClient()
  if (!iso) return null
  const fixed = new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
  return <time dateTime={iso} title={new Date(iso).toUTCString()}>{isClient ? timeAgo(iso) : fixed}</time>
}
