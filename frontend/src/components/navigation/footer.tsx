import Link from 'next/link'
import { cacheLife } from 'next/cache'

// Cached so the footer can be prerendered (reading the clock during prerender is not allowed)
async function CurrentYear() {
  'use cache'
  cacheLife('days')
  return new Date().getFullYear()
}

export function Footer() {
  return (
    <footer className="border-t bg-muted/20 py-12">
      <div className="container mx-auto px-4 md:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="font-serif text-xl font-bold tracking-wider">TRENDOSCOPE</span>
        </div>
        <p className="text-sm text-muted-foreground">
          © <CurrentYear /> TrendScope. All rights reserved.
        </p>
        <div className="flex gap-4">
          <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  )
}
