import { Suspense } from 'react'
import Link from 'next/link'
import { Search, User } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { createClient } from '@/utils/supabase/server'
import { AlertsBell } from './alerts-bell'
import { NavMenu } from './nav-menu'
import { PRIMARY_LINKS } from './nav-links'

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-4 xl:gap-6">
          {/* usePathname inside can suspend on dynamic routes, so it streams in */}
          <Suspense fallback={<div className="h-8 w-20 xl:hidden" aria-hidden />}>
            <NavMenu />
          </Suspense>
          <Link href="/" className="flex items-center space-x-2">
            <span className="font-serif text-xl font-bold tracking-wider">TRENDOSCOPE</span>
          </Link>
          <nav aria-label="Main" className="hidden xl:flex gap-4 2xl:gap-5">
            {PRIMARY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <AlertsBell />
          <Link href="/search" className={buttonVariants({ variant: "ghost", size: "icon" })}>
            <Search className="h-5 w-5" />
            <span className="sr-only">Search</span>
          </Link>
          {/* Reads auth cookies, so it streams in; the rest of the navbar stays prerendered */}
          <Suspense fallback={<div className="h-8 w-16" aria-hidden />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  )
}

async function UserMenu() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ? (
    <Button variant="ghost" size="icon">
      <User className="h-5 w-5" />
      <span className="sr-only">Profile</span>
    </Button>
  ) : (
    <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
      Sign In
    </Link>
  )
}
