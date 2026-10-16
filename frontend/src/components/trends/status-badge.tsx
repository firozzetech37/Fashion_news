import { cn } from "cn"
import { STATUS_STYLES, type TrendStatus } from "@/lib/trends"

/** Lifecycle chip. A leading dot carries the state alongside the colour, so it never relies on hue alone. */
export function StatusBadge({ status, size = "sm", className }: { status: TrendStatus | null; size?: "sm" | "lg"; className?: string }) {
  const style = STATUS_STYLES[status ?? "emerging"]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold tracking-wide ring-1",
        size === "lg" ? "px-3 py-1 text-xs" : "px-2.5 py-0.5 text-[11px]",
        style.className,
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {style.label}
    </span>
  )
}
