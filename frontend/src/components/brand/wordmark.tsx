import Link from "next/link"
import { cn } from "cn"

/** The radar mark: concentric signal rings with a rising sweep. Same geometry as app/icon.svg. */
export function Monogram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("size-7 shrink-0", className)}>
      <g fill="none" stroke="currentColor" strokeWidth="3">
        <circle cx="32" cy="32" r="22" opacity="0.28" />
        <circle cx="32" cy="32" r="13" opacity="0.55" />
      </g>
      <path d="M32 32 L48 16" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M39.5 16 H48 V24.5" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="4.5" fill="currentColor" />
    </svg>
  )
}

/** Wordmark with the monogram. Links home unless `asLink` is false (e.g. inside another link). */
export function Wordmark({ className, asLink = true }: { className?: string; asLink?: boolean }) {
  const inner = (
    <>
      <Monogram className="size-6 sm:size-7" />
      <span className="whitespace-nowrap font-serif text-base font-bold leading-none tracking-[0.16em] sm:text-[1.2rem] sm:tracking-[0.2em] xl:text-[1.05rem] xl:tracking-[0.16em] 2xl:text-[1.2rem] 2xl:tracking-[0.2em]">TREND SCOPE</span>
    </>
  )
  const classes = cn("inline-flex items-center gap-2.5 text-foreground", className)
  return asLink ? (
    <Link href="/" aria-label="TrendScope home" className={cn(classes, "transition-opacity duration-200 hover:opacity-80")}>
      {inner}
    </Link>
  ) : (
    <span className={classes}>{inner}</span>
  )
}
