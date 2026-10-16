"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "cn"

const TABS = [
  { href: "/admin/sources", label: "Sources" },
  { href: "/admin/ai", label: "AI Pipeline" },
]

export function AdminTabs() {
  const pathname = usePathname()
  return (
    <nav aria-label="Admin sections" className="border-b">
      <div className="container mx-auto flex gap-6 px-4 md:px-8">
        {TABS.map((tab) => {
          const active = pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 py-3 text-sm font-medium transition-colors",
                active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
