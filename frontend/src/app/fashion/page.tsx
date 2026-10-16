import type { Metadata } from "next"
import { VerticalPage } from "@/components/vertical/vertical-page"

export const metadata: Metadata = { title: "Fashion" }

export default function FashionPage() {
  return <VerticalPage vertical="fashion" />
}
