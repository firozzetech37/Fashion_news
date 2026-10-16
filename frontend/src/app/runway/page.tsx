import type { Metadata } from "next"
import { VerticalPage } from "@/components/vertical/vertical-page"

export const metadata: Metadata = { title: "Runway" }

export default function RunwayPage() {
  return <VerticalPage vertical="runway" />
}
