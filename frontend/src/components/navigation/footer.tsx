import Link from 'next/link'
import { cacheLife } from 'next/cache'
import { Wordmark } from '@/components/brand/wordmark'

// Cached so the footer can be prerendered (reading the clock during prerender is not allowed)
async function CurrentYear() {
  'use cache'
  cacheLife('days')
  return new Date().getFullYear()
}

const COLUMNS = [
  {
    title: 'Discover',
    links: [
      { href: '/trending', label: 'Trending' },
      { href: '/news', label: 'News' },
      { href: '/emerging', label: 'Emerging' },
      { href: '/radar', label: 'Trend Radar' },
      { href: '/forecast', label: 'Forecast' },
      { href: '/track-record', label: 'Track Record' },
      { href: '/analytics', label: 'Analytics' },
    ],
  },
  {
    title: 'Sections',
    links: [
      { href: '/fashion', label: 'Fashion' },
      { href: '/bollywood', label: 'Bollywood' },
      { href: '/hollywood', label: 'Hollywood' },
      { href: '/runway', label: 'Runway' },
    ],
  },
  {
    title: 'Intelligence',
    links: [
      { href: '/celebrities', label: 'Celebrities' },
      { href: '/brands', label: 'Brands' },
      { href: '/ask', label: 'Ask TrendScope' },
      { href: '/search', label: 'Search' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t border-foreground/[0.08] bg-muted/20">
      <div className="container mx-auto grid gap-10 px-4 py-14 md:grid-cols-[1.5fr_1fr_1fr_1fr] md:px-8">
        <div className="max-w-sm space-y-4">
          <Wordmark />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Discover what&apos;s trending before it becomes mainstream. AI fashion intelligence drawn from fashion,
            celebrity culture, brands and global media.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="space-y-3">
            <p className="eyebrow text-muted-foreground">{column.title}</p>
            <ul className="space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground">
                    <span className="link-reveal">{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-foreground/[0.06]">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
          <p>© <CurrentYear /> TrendScope. All rights reserved.</p>
          <div className="flex gap-5">
            <Link href="/terms" className="transition-colors duration-200 hover:text-foreground">Terms</Link>
            <Link href="/privacy" className="transition-colors duration-200 hover:text-foreground">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
