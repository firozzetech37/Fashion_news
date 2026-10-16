"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bell } from "lucide-react"
import { API_URL } from "@/lib/api"
import type { TrendAlert } from "@/lib/trends"

const SEEN_KEY = "trendscope.alerts.lastSeen"

const readSeen = () => { try { return Number(localStorage.getItem(SEEN_KEY)) || 0 } catch { return 0 } }
const writeSeen = (value: number) => { try { localStorage.setItem(SEEN_KEY, String(value)) } catch { /* private mode */ } }

/** Alerts are per day, so show the day rather than a misleading "minutes ago". */
function dayLabel(date: string) {
  const days = Math.round((new Date(new Date().toDateString()).getTime() - new Date(`${date}T00:00:00`).getTime()) / 86_400_000)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

const KIND_LABEL: Record<TrendAlert["kind"], string> = { breakout: "Breaking out", stage_up: "Stage change", new_emerging: "New trend" }

/** Trend alerts feed. "Unread" is remembered per browser; no sign-in needed. */
export function AlertsBell() {
  const [alerts, setAlerts] = useState<TrendAlert[]>([])
  const [seen, setSeen] = useState(0)

  useEffect(() => {
    fetch(`${API_URL}/api/alerts/?limit=25`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: TrendAlert[]) => { setAlerts(data); setSeen(readSeen()) })
      .catch(() => {})
  }, [])

  const newest = alerts.reduce((max, a) => Math.max(max, new Date(a.created_at).getTime()), 0)
  const unread = alerts.filter((a) => new Date(a.created_at).getTime() > seen).length

  return (
    <details className="relative" onToggle={(e) => { if (e.currentTarget.open && newest) { writeSeen(newest); setSeen(newest) } }}>
      <summary aria-label={unread ? `Alerts, ${unread} new` : "Alerts"}
        className="relative flex size-8 cursor-pointer list-none items-center justify-center rounded-lg hover:bg-muted [&::-webkit-details-marker]:hidden">
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-700 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </summary>
      <div className="absolute right-0 top-10 z-50 w-80 rounded-xl bg-background shadow-lg ring-1 ring-foreground/10">
        <p className="border-b px-4 py-2.5 text-sm font-semibold">Trend alerts</p>
        {alerts.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">No alerts yet.</p> : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {alerts.map((a) => (
              <li key={a.id}>
                <Link href={`/trends/${a.trend_slug}`} className="block px-4 py-3 hover:bg-muted">
                  <p className="flex justify-between gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <span>{KIND_LABEL[a.kind]}</span><span className="normal-case tracking-normal">{dayLabel(a.date)}</span>
                  </p>
                  <p className="text-sm font-medium">{a.title}</p>
                  {a.message && <p className="text-xs text-muted-foreground">{a.message}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
