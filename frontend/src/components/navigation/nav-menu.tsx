"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import { ALL_LINKS } from "./nav-links"

/** Compact menu for screens too narrow for the full link bar. Re-keyed on navigation so it closes. */
export function NavMenu() {
  const pathname = usePathname()
  return (
    <details key={pathname} className="group relative xl:hidden">
      <summary aria-label="Menu" className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors duration-200 hover:bg-muted sm:px-2.5 [&::-webkit-details-marker]:hidden">
        <Menu className="size-5" aria-hidden /> <span className="hidden sm:inline">Menu</span>
      </summary>
      <nav aria-label="Main" className="absolute left-0 top-10 z-50 grid w-56 gap-0.5 rounded-xl bg-background p-2 shadow-lg ring-1 ring-foreground/10">
        {ALL_LINKS.map((link) => (
          <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}
            className="rounded-lg px-3 py-2 text-sm transition-colors duration-200 hover:bg-muted aria-[current=page]:font-semibold">
            {link.label}
          </Link>
        ))}
      </nav>
    </details>
  )
}
