import { Suspense } from "react"
import type { Metadata } from "next"
import { AskPanel } from "@/components/assistant/ask-panel"

export const metadata: Metadata = { title: "Ask TrendScope | TrendScope" }

export default function AskPage({ searchParams }: PageProps<"/ask">) {
  return (
    <div className="container mx-auto max-w-3xl space-y-8 px-4 py-12 md:px-8">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">AI assistant</p>
        <h1 className="font-serif text-4xl font-bold tracking-tight md:text-5xl">Ask TrendScope</h1>
        <p className="text-muted-foreground">
          Answers are grounded in TrendScope&apos;s own trend scores and stories, with sources, and it says when the data is thin.
        </p>
      </header>
      <Suspense fallback={<AskPanel />}>
        {searchParams.then(({ q }) => <AskPanel initialQuestion={typeof q === "string" ? q : undefined} />)}
      </Suspense>
    </div>
  )
}
