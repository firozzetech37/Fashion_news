"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { cn } from "cn"
import { Monogram } from "@/components/brand/wordmark"
import { WIDE_PHOTOS } from "@/components/vertical/hero-photos"

/* Timing. The count itself is a CSS animation (see `loader-count` in globals.css), so it starts the instant
   the page paints, before any JavaScript runs; these numbers must match the keyframes there. */
const ACTIVE_MS = 3400 // time spent counting, excluding the pauses at each signal
const DWELL_MS = 220 // pause when a signal is found, while its photo lights up
const HOLD_MS = 500 // rest at 100 before the tear
const MAX_WAIT_MS = 3500 // longest we wait for the page to finish loading after the count

/** The pipeline, from the README's core loop; one step lights up per seventh of the time */
const STEPS = ["Collect", "Clean", "Understand", "Cluster", "Score", "Predict", "Present"]
/** The sections, found one by one as the radar sweeps; each lights its hero photo when the count passes `at` */
const SIGNALS = [
  { key: "home", label: "Trending", at: 10, x: 62, y: 34 },
  { key: "fashion", label: "Fashion", at: 28, x: 36, y: 58 },
  { key: "bollywood", label: "Bollywood", at: 46, x: 70, y: 66 },
  { key: "hollywood", label: "Hollywood", at: 64, x: 42, y: 30 },
  { key: "runway", label: "Runway", at: 82, x: 58, y: 72 },
] as const
/** When the count reaches each signal: the legs between stops take time in proportion to their distance, plus a dwell per stop */
const SIGNAL_AT_MS = SIGNALS.map((s, i) => (s.at / 100) * ACTIVE_MS + i * DWELL_MS)
const TOTAL_MS = ACTIVE_MS + (SIGNALS.length) * DWELL_MS
const STEP_MS = TOTAL_MS / STEPS.length

/* The same jagged seam as the hero photos; at the end the screen tears along it, left half up, right half down */
const TEAR = [
  [0.52, 0], [0.505, 0.07], [0.525, 0.13], [0.51, 0.2], [0.53, 0.27], [0.515, 0.35], [0.535, 0.41],
  [0.52, 0.49], [0.54, 0.56], [0.525, 0.63], [0.545, 0.7], [0.53, 0.78], [0.55, 0.85], [0.535, 0.93], [0.55, 1],
]
const seam = TEAR.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(", ")
const leftClip = `polygon(0% 0%, ${seam}, 0% 100%)`
const rightClip = `polygon(${seam}, 100% 100%, 100% 0%)`

type Phase = "loading" | "exit" | "fade" | "done"

/** Plays once per full page load; client-side navigations back to the home page skip it */
let playedThisLoad = false

/**
 * Opening sequence: the wordmark fills with white as the count runs while a radar sweep finds the five
 * sections one by one, then the screen tears in two along the seam to reveal the hero.
 */
export function HomeLoader() {
  const [phase, setPhase] = useState<Phase>("loading")
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    document.documentElement.style.overflow = "hidden"
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const timers: ReturnType<typeof setTimeout>[] = []
    const later = (fn: () => void, ms: number) => { timers.push(setTimeout(fn, ms)) }
    const leave = (next: Phase) => {
      playedThisLoad = true // set only when it finishes, so React's development double-run of this effect doesn't count
      document.documentElement.style.overflow = ""
      setPhase(next)
      later(() => setPhase("done"), 1500) // if the exit animation never fires, go anyway
    }

    if (playedThisLoad || reduced) {
      const raf = requestAnimationFrame(() => leave("fade"))
      return () => { cancelAnimationFrame(raf); timers.forEach(clearTimeout); document.documentElement.style.overflow = "" }
    }

    // The CSS count finishing is the cue: then wait for the page to load (but not for long), rest, and tear
    let going = false
    const go = () => {
      if (going) return
      going = true
      const tear = () => { window.removeEventListener("load", tear); later(() => leave("exit"), HOLD_MS) }
      if (document.readyState === "complete") tear()
      else { window.addEventListener("load", tear); later(tear, MAX_WAIT_MS) }
    }
    const onEnd = (e: AnimationEvent) => { if (e.animationName === "loader-count") go() }
    root.addEventListener("animationend", onEnd)
    // The count started at first paint, so it may already be over by the time this runs; or the browser may not animate it at all
    const sincePaint = performance.now() - (performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint")?.startTime ?? performance.now())
    later(go, Math.max(0, TOTAL_MS - sincePaint) + 400)

    return () => { root.removeEventListener("animationend", onEnd); timers.forEach(clearTimeout); document.documentElement.style.overflow = "" }
  }, [])

  if (phase === "done") return null

  // The big type and the radar drift against the mouse
  const onMouseMove = (e: React.MouseEvent) => {
    const el = rootRef.current
    if (!el) return
    el.style.setProperty("--px", String(e.clientX / window.innerWidth - 0.5))
    el.style.setProperty("--py", String(e.clientY / window.innerHeight - 0.5))
  }

  return (
    <div ref={rootRef} role="status" aria-live="polite" aria-label="Loading TrendScope" data-loader onMouseMove={onMouseMove}
      onAnimationEnd={(e) => { if (e.animationName.startsWith("loader-tear") || e.animationName === "loader-fade") setPhase("done") }}
      className={cn("loader-run fixed inset-0 z-[70] text-white", phase === "fade" && "loader-fade")}>
      {/* Two clipped copies of the same face, so the tear can send each half its own way */}
      <div className={cn("absolute inset-0", phase === "exit" && "loader-tear-left")} style={{ clipPath: leftClip }}>
        <Face />
      </div>
      <div className={cn("absolute inset-0", phase === "exit" && "loader-tear-right")} style={{ clipPath: rightClip }}>
        <Face />
      </div>
      {/* The seam itself, drawn only while loading so the tear reads as a line opening up */}
      {phase === "loading" && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d={TEAR.map(([x, y], i) => `${i ? "L" : "M"}${x * 100} ${y * 100}`).join(" ")} fill="none" stroke="white" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1 }} />
        </svg>
      )}
    </div>
  )
}

/** Everything here is timed by CSS from the loader's custom properties and animation delays; no state needed */
function Face() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-neutral-950">
      {/* Grid, radar and grain behind everything */}
      <div aria-hidden className="absolute inset-0 opacity-[0.06]"
        style={{ backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "96px 96px" }} />
      <div aria-hidden className="loader-parallax-back absolute left-1/2 top-1/2 size-[135vmax]">
        <div className="absolute inset-0 rounded-full border border-white/10" />
        <div className="absolute inset-[16%] rounded-full border border-white/10" />
        <div className="absolute inset-[32%] rounded-full border border-white/15" />
        <div className="absolute inset-[42%] rounded-full border border-white/20" />
        <div className="radar-sweep absolute inset-0 rounded-full"
          style={{ background: "conic-gradient(from 0deg, rgba(255,255,255,0.22) 0deg, rgba(255,255,255,0.05) 50deg, transparent 100deg)" }} />
        <div className="radar-ping absolute inset-[30%] rounded-full border border-white/40" />
        {SIGNALS.map((s, i) => (
          <span key={s.key} className="loader-signal absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${s.x}%`, top: `${s.y}%`, animationDelay: `${SIGNAL_AT_MS[i]}ms` }}>
            <span className="block size-2.5 rounded-full bg-red-500 shadow-[0_0_24px_6px_rgba(239,68,68,0.45)]" />
          </span>
        ))}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-screen"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_50%,transparent_40%,rgba(0,0,0,0.7)_100%)]" />

      {/* Corner labels */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 md:p-8 lg:px-12">
        <div className="space-y-1">
          <p className="bracket-label">[ TrendScope ]</p>
          <p className="bracket-label text-white/60">[ AI fashion intelligence ]</p>
        </div>
        <p className="loader-signals bracket-label whitespace-nowrap text-white/60" aria-hidden />
      </div>

      {/* Centre: the wordmark filling with white, then the five sections lighting up as they are found */}
      {/* Vertical centring lives in .loader-parallax (Tailwind's translate utilities would stack on top of it) */}
      <div className="loader-parallax absolute inset-x-0 top-1/2 flex flex-col items-center px-4 text-center">
        <div className="relative">
          <span className="font-display block text-[clamp(3rem,13.5vw,15rem)] leading-none tracking-tight text-transparent"
            style={{ WebkitTextStroke: "1px rgba(255,255,255,0.5)" }}>TRENDSCOPE</span>
          <span aria-hidden className="loader-fill font-display absolute inset-0 block text-[clamp(3rem,13.5vw,15rem)] leading-none tracking-tight text-white">TRENDSCOPE</span>
        </div>
        <div className="mt-6 flex gap-2 md:mt-10 md:gap-3">
          {SIGNALS.map((s, i) => (
            <div key={s.key} className="loader-photo relative h-[4.5rem] w-14 overflow-hidden border border-white/40 md:h-32 md:w-24 lg:h-40 lg:w-28"
              style={{ animationDelay: `${SIGNAL_AT_MS[i]}ms` }}>
              <Image src={WIDE_PHOTOS[s.key].src} alt="" fill sizes="112px" placeholder="blur" className="object-cover" style={{ objectPosition: WIDE_PHOTOS[s.key].focus }} />
              <span className="absolute right-1 top-1 size-1.5 rounded-full bg-red-500" />
            </div>
          ))}
        </div>
        <div className="relative mt-5 h-4 w-full md:mt-6">
          {STEPS.map((label, i) => (
            <p key={label} className="loader-step bracket-label absolute inset-x-0 text-white/60"
              style={{ animationDelay: `${i * STEP_MS}ms`, animationDuration: `${STEP_MS}ms`, animationFillMode: i === STEPS.length - 1 ? "forwards" : "none" }}>
              [ {String(i + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")} ] <span className="text-white">[ {label} ]</span>
            </p>
          ))}
        </div>
      </div>

      {/* Bottom: mark and status on the left, the count on the right */}
      <div className="absolute bottom-5 left-4 flex items-center gap-3 md:bottom-8 md:left-8 lg:left-12">
        <Monogram className="size-7 text-white md:size-8" />
        <p className="bracket-label text-white/60">[ loading ]<span className="hidden sm:inline"> [ where data meets style ]</span></p>
      </div>
      <p className="font-display absolute bottom-1 right-4 text-[clamp(4.5rem,13vw,12rem)] leading-none tabular-nums tracking-tight md:right-8 lg:right-12">
        <span className="loader-count" aria-hidden /><span className="ml-1 text-[0.28em] text-white/50">%</span>
      </p>

      {/* The count as a line along the top edge */}
      <div className="absolute inset-x-0 top-0 h-px bg-white/15">
        <div className="loader-line h-full bg-white" />
      </div>
    </div>
  )
}
