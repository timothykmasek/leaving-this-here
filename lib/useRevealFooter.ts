'use client'

import { useEffect, useRef, useState } from 'react'

// Reveal-on-scroll-up footer: the profile feed is effectively endless, so a
// bottom-anchored footer is unreachable. Instead the footer lives in a fixed
// bar that slides in when the user scrolls *up* (or reaches the true end) and
// tucks away again on scroll-down — same pattern as mobile browser chrome.
//
// The shown flag + last scroll position are refs, NOT state read inside the
// handler — scroll events fire faster than React re-renders, so reading state
// there gives stale values and the hide branch silently fails. State is only
// mirrored on an actual change to avoid re-render thrash.
//
// A per-direction ACCUMULATED distance (not a per-event delta) gates the
// flip, so momentum wobble and sub-pixel jitter can't toggle the bar: it only
// reveals/hides after a deliberate drag. Reveal after 44px of sustained
// scroll-up (past a 160px top gate); hide after 72px of sustained scroll-down.
// The accumulator resets to 0 on every flip (hysteresis) so a reversal needs a
// fresh, intentional gesture rather than one stray pixel back.
const HIDE_AFTER = 72
const SHOW_AFTER = 44
const TOP_GATE = 160
const BOTTOM_TOLERANCE = 4

export function useRevealFooter(enabled: boolean) {
  const [revealed, setRevealed] = useState(false)
  const lastY = useRef(0)
  const shown = useRef(false)
  const acc = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const doc = document.documentElement
    const set = (next: boolean) => {
      if (next === shown.current) return
      shown.current = next
      acc.current = 0 // hysteresis: require a fresh gesture to flip back
      setRevealed(next)
    }
    const onScroll = () => {
      const y = window.scrollY
      const dy = y - lastY.current
      lastY.current = y
      // Accumulate within a direction; a direction change restarts the count.
      acc.current = dy > 0 ? Math.max(0, acc.current) + dy : Math.min(0, acc.current) + dy
      const atBottom = window.innerHeight + y >= doc.scrollHeight - BOTTOM_TOLERANCE
      let next = shown.current
      if (atBottom) next = true
      else if (acc.current > HIDE_AFTER) next = false // sustained scroll down → tuck away
      else if (acc.current < -SHOW_AFTER && y > TOP_GATE) next = true // sustained scroll up → reveal
      set(next)
    }
    // Sparse pages never fire scroll events — if the content doesn't scroll,
    // the footer would be unreachable forever. Watch content size and reveal
    // whenever the page is unscrollable.
    const checkScrollable = () => {
      if (doc.scrollHeight <= window.innerHeight + 4) set(true)
    }
    checkScrollable()
    const ro = new ResizeObserver(checkScrollable)
    ro.observe(document.body)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', checkScrollable)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', checkScrollable)
    }
  }, [enabled])

  return revealed
}
