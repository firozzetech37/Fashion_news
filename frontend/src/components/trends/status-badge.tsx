import { cn } from "cn"
import { STATUS_STYLES, type TrendStatus } from "@/lib/trends"

export function StatusBadge({ status, className }: { status: TrendStatus | null; className?: string }) {
  const style = STATUS_STYLES[status ?? "emerging"]
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", style.className, className)}>
      {style.label}
    </span>
  )
}
