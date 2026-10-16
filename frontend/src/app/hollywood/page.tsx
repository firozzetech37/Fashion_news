import type { Metadata } from "next"
import { VerticalPage } from "@/components/vertical/vertical-page"

export const metadata: Metadata = { title: "Hollywood | TrendScope" }

export default function HollywoodPage() {
  return <VerticalPage vertical="hollywood" />
}
