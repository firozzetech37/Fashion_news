import type { Metadata } from "next"
import { SourcesManager } from "@/components/admin/sources-manager"

export const metadata: Metadata = {
  title: "Sources · Admin",
}

export default function AdminSourcesPage() {
  return (
    <div className="container mx-auto px-4 md:px-8 py-10 space-y-8">
      <div className="space-y-1">
        <p className="eyebrow text-muted-foreground">Admin</p>
        <h1 className="font-serif text-3xl md:text-4xl font-bold tracking-tight">Data Sources</h1>
        <p className="text-muted-foreground">
          Manage the feeds TrendScope collects from. Active sources are collected automatically on a schedule.
        </p>
      </div>
      <SourcesManager />
    </div>
  )
}
