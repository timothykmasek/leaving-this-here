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
// Thresholds (±6px delta, 160px top gate, 4px bottom tolerance) prevent
// jitter from momentum scrolling.
export function useRevealFooter(enabled: boolean) {
  const [revealed, setRevealed] = useState(false)
  const lastY = useRef(0)
  const shown = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const doc = document.documentElement
    const set = (next: boolean) => {
      if (next === shown.current) return
      shown.current = next
      setRevealed(next)
    }
    const onScroll = () => {
      const y = window.scrollY
      const dy = y - lastY.current
      lastY.current = y
      const atBottom = window.innerHeight + y >= doc.scrollHeight - 4
      let next = shown.current
      if (atBottom) next = true
      else if (dy > 6) next = false // scrolling down → tuck away
      else if (dy < -6 && y > 160) next = true // scrolling up → reveal
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
