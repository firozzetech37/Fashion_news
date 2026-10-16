import type { Metadata } from "next"
import { VerticalPage } from "@/components/vertical/vertical-page"

export const metadata: Metadata = { title: "Bollywood" }

export default function BollywoodPage() {
  return <VerticalPage vertical="bollywood" />
}
