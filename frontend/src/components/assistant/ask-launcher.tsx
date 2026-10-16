"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Maximize2, Sparkles, X } from "lucide-react"
import { AskPanel } from "./ask-panel"

/** Floating "Ask TrendScope" button + side panel, on every page except /ask itself. */
export function AskLauncher() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  if (pathname.startsWith("/ask") || pathname.startsWith("/admin")) return null

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background shadow-lift ring-1 ring-white/10 transition-[transform,box-shadow] duration-300 ease-out-expo hover:-translate-y-0.5 hover:shadow-xl">
          <Sparkles className="size-4" aria-hidden /> Ask TrendScope
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="Ask TrendScope" aria-modal="false"
          className="fixed inset-x-0 bottom-0 z-50 flex h-[85vh] flex-col bg-background shadow-2xl ring-1 ring-foreground/10 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[min(720px,calc(100vh-6rem))] sm:w-[420px] sm:rounded-2xl">
          <header className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="flex items-center gap-2 font-serif text-lg font-semibold"><Sparkles className="size-4" aria-hidden /> Ask TrendScope</h2>
            <div className="flex items-center gap-1">
              <Link href="/ask" onClick={() => setOpen(false)} aria-label="Open full page" className="rounded-lg p-1.5 transition-colors duration-200 hover:bg-muted"><Maximize2 className="size-4" /></Link>
              <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 transition-colors duration-200 hover:bg-muted"><X className="size-4" /></button>
            </div>
          </header>
          <AskPanel compact />
        </div>
      )}
    </>
  )
}
