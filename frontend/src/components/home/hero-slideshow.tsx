"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image, { type StaticImageData } from "next/image"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { cn } from "cn"

export interface HeroSlide {
  key: string
  /** Small line above the headline, e.g. "Hollywood style" */
  eyebrow: string
  /** Section name: the headline */
  title: string
  tagline: string
  href: string
  cta: string
  /** Live numbers for the info card; null when the API is down */
  top: { name: string; slug: string; score: number } | null
  stats: { label: string; value: string }[]
  photo: { src: StaticImageData; alt: string; focus: string; credit: string }
}

const INTERVAL_MS = 7000
const SLIDE_MS = 1500
const SWIPE_PX = 60

/* A jagged tear running top to bottom, slightly right of centre, as fractions of width/height.
   Used twice: as the clip edge of the black-and-white half and as the thin white seam drawn over it. */
const TEAR = [
  [0.52, 0], [0.505, 0.07], [0.525, 0.13], [0.51, 0.2], [0.53, 0.27], [0.515, 0.35], [0.535, 0.41],
  [0.52, 0.49], [0.54, 0.56], [0.525, 0.63], [0.545, 0.7], [0.53, 0.78], [0.55, 0.85], [0.535, 0.93], [0.55, 1],
]
const tearPolygon = `polygon(${TEAR.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(", ")}, 100% 100%, 100% 0%)`
const tearPath = TEAR.map(([x, y], i) => `${i ? "L" : "M"}${x * 100} ${y * 100}`).join(" ")

/**
 * Full-screen lookbook: each slide is a whole page (photo, headline, info card). On change the old page
 * slides out through the top while the new one rises from below, joined edge to edge. Auto-advances,
 * pauses on hover, and also moves on click, arrow keys and horizontal swipe.
 */
export function HeroSlideshow({ slides }: { slides: HeroSlide[] }) {
  const [current, setCurrent] = useState(0)
  const [previous, setPrevious] = useState<number | null>(null)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [paused, setPaused] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef(0)
  const busy = useRef(false)
  const touchX = useRef<number | null>(null)

  const go = useCallback((step: 1 | -1) => {
    if (busy.current || slides.length < 2) return
    busy.current = true
    const from = currentRef.current
    const to = (from + step + slides.length) % slides.length
    currentRef.current = to
    setDirection(step)
    setPrevious(from)
    setCurrent(to)
    setTimeout(() => { setPrevious(null); busy.current = false }, SLIDE_MS + 50)
  }, [slides.length])

  // Auto-advance; `current` in the deps restarts the timer (and the progress line) after a manual move
  useEffect(() => {
    if (paused || slides.length < 2) return
    const id = setInterval(() => go(1), INTERVAL_MS)
    return () => clearInterval(id)
  }, [paused, current, go, slides.length])

  // Left/right arrow keys while the hero is on screen (up/down are left to the page scroll)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const r = rootRef.current?.getBoundingClientRect()
      if (!r || r.bottom < window.innerHeight * 0.4 || r.top > window.innerHeight * 0.6) return
      if (e.key === "ArrowRight") go(1)
      else if (e.key === "ArrowLeft") go(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go])

  // Gentle parallax: the photo drifts against the mouse
  const onMouseMove = (e: React.MouseEvent) => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty("--px", String((e.clientX - r.left) / r.width - 0.5))
    el.style.setProperty("--py", String((e.clientY - r.top) / r.height - 0.5))
  }

  return (
    <div ref={rootRef} className="relative h-full overflow-hidden"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onMouseMove={onMouseMove}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (Math.abs(dx) > SWIPE_PX) go(dx < 0 ? 1 : -1)
      }}>

      {/* Every page stays mounted so its photo is decoded before it slides in; only the current and outgoing are visible */}
      {slides.map((slide, i) => {
        const isCurrent = i === current
        const isPrevious = i === previous
        return (
          <div key={slide.key} aria-hidden={!isCurrent}
            className={cn("absolute inset-0", isCurrent ? "z-10" : isPrevious ? "z-0" : "invisible",
              isCurrent && previous !== null && (direction === 1 ? "hero-enter" : "hero-enter-back"),
              isPrevious && (direction === 1 ? "hero-leave" : "hero-leave-back"))}>
            <Page slide={slide} eager={i === 0} onNext={() => go(1)} />
          </div>
        )
      })}

      {/* Time until the next page; restarts with each slide */}
      <div className="absolute inset-x-0 bottom-0 z-20 h-px bg-white/15">
        <div key={current} className="hero-progress h-full bg-white"
          style={{ animationDuration: `${INTERVAL_MS}ms`, animationPlayState: paused ? "paused" : "running" }} />
      </div>
    </div>
  )
}

function Page({ slide, eager, onNext }: { slide: HeroSlide; eager: boolean; onNext: () => void }) {
  return (
    <>
      {/* Photo: clicking it goes to the next page */}
      <div className="absolute inset-0 cursor-pointer" onClick={onNext} aria-hidden>
        <div className="hero-parallax absolute inset-0">
          <TornPhoto photo={slide.photo} eager={eager} />
        </div>
        {/* Keeps the labels and text readable over bright or busy areas of the photo */}
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-black/50 via-transparent to-transparent md:w-3/4" />
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-end px-4 pb-24 pt-24 md:px-8 md:pb-28 lg:px-12">
        <div className="pointer-events-auto max-w-4xl">
          <p className="bracket-label text-white/75">[ {slide.eyebrow} ]</p>
          <h2 className="font-display mt-2 break-words text-[clamp(3rem,13vw,7rem)] uppercase leading-[0.88] tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)] md:whitespace-nowrap md:text-[clamp(4.5rem,min(8.5vw,15vh),10rem)]">
            {slide.title}
          </h2>
          <InfoCard slide={slide} className="mt-6 max-w-xl" />
        </div>
      </div>

      <p className="bracket-label absolute bottom-7 left-4 z-10 text-white/50 md:bottom-9 md:left-8 lg:left-12">[ photo · {slide.photo.credit} ]</p>
    </>
  )
}

function InfoCard({ slide, className }: { slide: HeroSlide; className?: string }) {
  return (
    <div className={cn("border border-white/20 bg-black/40 p-4 backdrop-blur-md md:p-6", className)}>
      <p className="text-sm leading-relaxed text-white/85 md:text-lg">{slide.tagline}</p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-white/15 pt-4 md:mt-5 md:pt-5">
        <dt className="bracket-label pt-0.5 text-white/55">#1 trend</dt>
        <dd className="min-w-0">
          {slide.top ? (
            <Link href={`/trends/${slide.top.slug}`} className="group inline-flex max-w-full items-baseline gap-2">
              <span className="link-reveal truncate font-serif text-lg font-semibold text-white md:text-xl">{slide.top.name}</span>
              <span className="font-display text-lg leading-none text-red-500">{slide.top.score}</span>
            </Link>
          ) : <span className="text-white/60">No data yet</span>}
        </dd>
        {slide.stats.map((s) => (
          <div key={s.label} className="contents">
            <dt className="bracket-label pt-0.5 text-white/55">{s.label}</dt>
            <dd className="font-serif text-lg text-white md:text-xl">{s.value}</dd>
          </div>
        ))}
      </dl>
      <Link href={slide.href} className="group mt-5 inline-flex items-center gap-2 border border-white px-5 py-2.5 text-white transition-colors duration-300 hover:bg-white hover:text-neutral-950 md:mt-6">
        <span className="bracket-label">[ {slide.cta} ]</span>
        <ArrowUpRight className="size-4 transition-transform duration-300 ease-out-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  )
}

function TornPhoto({ photo, eager }: { photo: HeroSlide["photo"]; eager: boolean }) {
  const img = (className: string) => (
    <Image src={photo.src} alt={photo.alt} fill loading="eager" fetchPriority={eager ? "high" : "low"} placeholder="blur"
      sizes="100vw" className={cn("object-cover", className)} style={{ objectPosition: photo.focus }} />
  )
  return (
    <div className="absolute inset-0 bg-neutral-900">
      {img("")}
      <div className="absolute inset-0" style={{ clipPath: tearPolygon }}>
        {img("grayscale contrast-[1.05]")}
      </div>
      {/* White seam along the tear */}
      <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={tearPath} fill="none" stroke="white" vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={{ strokeWidth: 3 }} />
      </svg>
    </div>
  )
}
