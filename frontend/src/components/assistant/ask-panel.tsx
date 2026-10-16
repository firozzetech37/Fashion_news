"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUp, ExternalLink, Sparkles } from "lucide-react"
import { cn } from "cn"
import { API_URL } from "@/lib/api"
import type { AskResponse } from "@/lib/trends"
import { AnswerText } from "./answer-text"

export const EXAMPLE_QUESTIONS = [
  "What is trending in Indian bridal fashion?",
  "What colors are rising this season?",
  "What are Bollywood celebrities wearing?",
  "Which trends are breaking out right now?",
]

const STEPS = ["Searching recent stories…", "Matching trends and signals…", "Writing a grounded answer…"]

type Turn = { question: string; response?: AskResponse; error?: string }

export function AskPanel({ initialQuestion, compact = false }: { initialQuestion?: string; compact?: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const bottom = useRef<HTMLDivElement>(null)
  const asked = useRef(false)

  const ask = async (question: string) => {
    const q = question.trim()
    if (q.length < 3 || loading) return
    setInput("")
    setLoading(true)
    setStep(0)
    setTurns((t) => [...t, { question: q }])
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2500)
    let result: Turn = { question: q }
    try {
      const res = await fetch(`${API_URL}/api/ask/`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }),
      })
      const body = await res.json()
      result = res.ok ? { question: q, response: body } : { question: q, error: typeof body.detail === "string" ? body.detail : "Something went wrong." }
    } catch {
      result = { question: q, error: "Couldn't reach TrendScope. Is the API running?" }
    } finally {
      clearInterval(ticker)
      setTurns((t) => [...t.slice(0, -1), result])
      setLoading(false)
    }
  }

  // Ask the question passed in the URL once (e.g. /ask?q=...)
  useEffect(() => {
    if (initialQuestion && !asked.current) {
      asked.current = true
      void ask(initialQuestion)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the initial question
  }, [initialQuestion])

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }) }, [turns, loading])

  return (
    <div className={cn("flex min-h-0 flex-col", compact ? "h-full" : "")}>
      <div className={cn("min-h-0 flex-1 space-y-8", compact && "overflow-y-auto px-5 py-5")}>
        {turns.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ask about trends, colors, celebrities or brands. Answers come only from TrendScope&apos;s own data, with sources.
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button key={q} onClick={() => ask(q)} className="rounded-full px-3 py-1.5 text-left text-sm ring-1 ring-foreground/15 transition-colors duration-200 hover:bg-muted">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className="space-y-4">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-foreground px-4 py-2 text-sm text-background">{turn.question}</p>
            {!turn.response && !turn.error && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Sparkles className="size-4 animate-pulse" aria-hidden /> {STEPS[step]}
              </p>
            )}
            {turn.error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">{turn.error}</p>}
            {turn.response && <Answer response={turn.response} onAsk={ask} compact={compact} />}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void ask(input) }}
        className={cn("flex items-center gap-2 rounded-full bg-background py-1.5 pl-4 pr-1.5 ring-1 ring-foreground/20 focus-within:ring-2 focus-within:ring-foreground",
          compact ? "mx-4 mb-4" : "sticky bottom-4 mt-8")}>
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={300} disabled={loading}
          placeholder="Ask anything about fashion trends…" aria-label="Ask TrendScope"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        <button type="submit" disabled={loading || input.trim().length < 3} aria-label="Send"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-30">
          <ArrowUp className="size-4" />
        </button>
      </form>
    </div>
  )
}

function Answer({ response: r, onAsk, compact }: { response: AskResponse; onAsk: (q: string) => void; compact: boolean }) {
  return (
    <div className="space-y-5">
      <div className="text-[15px]"><AnswerText text={r.answer} /></div>
      <p className="text-xs text-muted-foreground">
        Based on {r.signals_used.trends} trends and {r.signals_used.articles} stories · {r.confidence} confidence
      </p>
      {r.trends.length > 0 && (
        <div className="space-y-2">
          <h4 className="eyebrow text-muted-foreground">Trends</h4>
          <ul className={cn("grid gap-2", !compact && "sm:grid-cols-2")}>
            {r.trends.map(({ trend, reason }) => (
              <li key={trend.slug}>
                <Link href={`/trends/${trend.slug}`} className="block rounded-lg p-3 ring-1 ring-foreground/10 transition-colors duration-200 hover:bg-muted">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-serif font-semibold">{trend.name}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{Math.round(trend.trend_score)} · {trend.status}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{reason}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.articles.length > 0 && (
        <div className="space-y-2">
          <h4 className="eyebrow text-muted-foreground">Sources</h4>
          <ol className="space-y-1.5 text-sm">
            {r.articles.map((a, i) => (
              <li key={a.id} className="flex gap-2">
                <span className="tabular-nums text-muted-foreground">{i + 1}.</span>
                <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {a.title} <span className="text-muted-foreground">· {a.source_name}</span> <ExternalLink className="inline size-3 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
      {r.follow_up_questions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {r.follow_up_questions.map((q) => (
            <button key={q} onClick={() => onAsk(q)} className="rounded-full px-3 py-1.5 text-left text-xs ring-1 ring-foreground/15 transition-colors duration-200 hover:bg-muted">{q}</button>
          ))}
        </div>
      )}
    </div>
  )
}
