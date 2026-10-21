"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { PRIMARY_LINKS } from "./nav-links"

const isActive = (href: string, pathname: string) =>
  pathname === href ||
  pathname.startsWith(`${href}/`) ||
  (href === "/trending" && pathname.startsWith("/trends/"))

/** Desktop navigation with an underline that draws in on hover and stays on the current section. */
export function NavLinksBar() {
  const pathname = usePathname()
  return (
    <nav aria-label="Main" className="hidden h-16 items-center xl:flex">
      {PRIMARY_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={isActive(link.href, pathname) ? "page" : undefined}
          className="relative flex h-16 items-center whitespace-nowrap px-2 text-sm 2xl:px-2.5 font-medium text-muted-foreground transition-colors duration-200 after:absolute after:inset-x-2 after:bottom-0 2xl:after:inset-x-2.5 after:h-px after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform after:duration-300 after:ease-out-expo hover:text-foreground hover:after:scale-x-100 aria-[current=page]:text-foreground aria-[current=page]:after:scale-x-100"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
