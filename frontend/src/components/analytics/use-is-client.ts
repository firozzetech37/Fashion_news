import { useSyncExternalStore } from "react"

const subscribe = () => () => {}

/**
 * True only in the browser. Recharts sizes itself from the DOM, and rendering it during SSR left
 * charts intermittently blank after hydration, so charts render client-side only.
 */
export function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false)
}
