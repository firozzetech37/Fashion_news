import { Suspense } from 'react'
import Link from 'next/link'
import { LogIn, Search, User } from 'lucide-react'
import { cn } from 'cn'
import { Button, buttonVariants } from '@/components/ui/button'
import { Wordmark } from '@/components/brand/wordmark'
import { createClient } from '@/utils/supabase/server'
import { AlertsBell } from './alerts-bell'
import { NavLinksBar } from './nav-links-bar'
import { NavMenu } from './nav-menu'

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-foreground/[0.08] bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-4 xl:gap-8">
          {/* usePathname inside can suspend on dynamic routes, so these stream in */}
          <Suspense fallback={<div className="h-8 w-20 xl:hidden" aria-hidden />}>
            <NavMenu />
          </Suspense>
          <Wordmark />
          <Suspense fallback={<div className="hidden h-16 xl:block" aria-hidden />}>
            <NavLinksBar />
          </Suspense>
        </div>
        <div className="flex items-center gap-1.5">
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
    <Button variant="ghost" size="icon" aria-label="Signed in">
      <User className="h-5 w-5" />
      <span className="sr-only">Profile</span>
    </Button>
  ) : (
    <>
      {/* Icon-only on phones so the header never overflows; the pill button from sm up */}
      <Link href="/login" aria-label="Sign in" className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "sm:hidden")}>
        <LogIn className="h-5 w-5" />
      </Link>
      <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-1 hidden rounded-full px-4 sm:inline-flex")}>
        Sign In
      </Link>
    </>
  )
}
