import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { cn } from "cn"

type Props = {
  title: string
  eyebrow?: string
  subtitle?: string
  href?: string
  linkLabel?: string
  size?: "md" | "lg"
  as?: "h2" | "h3"
  className?: string
}

/** The one section heading used across the site: eyebrow, serif title, optional subtitle and "View all" link. */
export function SectionHeader({ title, eyebrow, subtitle, href, linkLabel = "View all", size = "lg", as: Tag = "h2", className }: Props) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow && <p className="eyebrow text-muted-foreground">{eyebrow}</p>}
        <Tag className={cn("font-serif font-semibold tracking-tight", size === "lg" ? "text-3xl" : "text-2xl")}>{title}</Tag>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {href && (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1 pb-1 text-sm font-medium">
          <span className="link-reveal">{linkLabel}</span>
          <ArrowUpRight className="size-4 transition-transform duration-300 ease-out-expo group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      )}
    </div>
  )
}
