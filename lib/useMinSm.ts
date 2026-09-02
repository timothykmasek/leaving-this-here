'use client'

import { useSyncExternalStore } from 'react'

// True at Tailwind's sm: breakpoint and up. One module-level MediaQueryList
// shared by every subscriber — the profile grid mounts hundreds of memoized
// cards, and each creating its own matchMedia would be pure waste.
//
// The server snapshot says TRUE (desktop): SSR markup renders the desktop
// treatment, hydration matches it, and a phone flips to the mobile treatment
// in the first client render after hydration — no mismatch warnings.
const QUERY = '(min-width: 640px)'

let mql: MediaQueryList | null = null
const getMql = () => (mql ??= window.matchMedia(QUERY))

const subscribe = (cb: () => void) => {
  const m = getMql()
  m.addEventListener('change', cb)
  return () => m.removeEventListener('change', cb)
}

export function useMinSm(): boolean {
  return useSyncExternalStore(subscribe, () => getMql().matches, () => true)
}
