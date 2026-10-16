import type { Metadata } from "next"
import { AIPipelineDashboard } from "@/components/admin/ai-pipeline"

export const metadata: Metadata = {
  title: "AI Pipeline · Admin",
}

export default function AdminAIPage() {
  return (
    <div className="container mx-auto px-4 md:px-8 py-10 space-y-8">
      <div className="space-y-1">
        <p className="eyebrow text-muted-foreground">Admin</p>
        <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight">AI Pipeline</h1>
        <p className="text-muted-foreground">
          Every collected article is classified, mined for entities and trends, summarized and embedded.
        </p>
      </div>
      <AIPipelineDashboard />
    </div>
  )
}
