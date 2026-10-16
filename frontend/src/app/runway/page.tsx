import type { Metadata } from "next"
import { VerticalPage } from "@/components/vertical/vertical-page"

export const metadata: Metadata = { title: "Runway | TrendScope" }

export default function RunwayPage() {
  return <VerticalPage vertical="runway" />
}
