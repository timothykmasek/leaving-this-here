'use client'

import { useEffect, useRef, useState } from 'react'

// The owner's persistent "add a link" affordance — a frosted tile that floats
// over the feed and, when tapped, blooms into a frosted bar you paste one link
// into. Saving goes through /api/import (the same shared pipeline as every
// other save path), so metadata, screenshot, and embedding all happen exactly
// as they would from the extension or a bulk import.
//
// It used to be a <Link> straight to /import. That page is the BULK flow
// (paste a CSV, walk a batch) — the wrong weight for "I have one link on my
// clipboard". Bulk stays reachable from the footer's Import link; this box is
// the one-at-a-time door.
//
// Bottom-right, not top-right. The top-right of a profile already holds the
// header's Log out (and on mobile the search glass), and the top-left holds
// the pinned wordmark — bottom-right is the one corner with nothing in it,
// and it's where a persistent add action is conventionally looked for. On
// phones the corner opened up when mobile search moved into the header.
//
// ── Where it sits ──────────────────────────────────────────────────────────
//
// On the grid's right edge, not the viewport's — the same
// fixed-full-width-then-mx-auto trick BulletinHeader uses for the pinned
// wordmark keeps it on the line the cards end on. Parked permanently ABOVE
// where the revealed footer bar lands (bar height + a gap, safe-area carried
// through) rather than dodging it.
const FOOTER_CLEARANCE = 'calc(55px + max(18px, env(safe-area-inset-bottom)))'

// One URL out of whatever was pasted or typed. Forgiving the same way the
// bulk page is: explicit http(s) passes through, a bare domain (stripe.com)
// gets https:// added, anything else is not a link.
function parseOneUrl(raw: string): string | null {
  const t = raw.trim().replace(/^["'<]|[>"',;.]+$/g, '')
  if (!t || t.includes(' ')) return null
  const candidate = t.includes('://') ? t : /^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/.test(t) ? `https://${t}` : null
  if (!candidate) return null
  try {
    const u = new URL(candidate)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'skipped' }
  | { kind: 'invalid' }
  | { kind: 'failed' }

// The transient states hold the bar in message dress for a beat, then hand
// the input back. Long enough to read four words in Cardo, short enough that
// pasting a second link never feels gated.
const MESSAGE_MS = 1600

const MESSAGES: Record<Exclude<Status['kind'], 'idle' | 'saving'>, string> = {
  saved: 'Saved to your bulletin',
  skipped: 'Already on your bulletin',
  invalid: 'That doesn’t look like a link',
  failed: 'That link didn’t go through',
}

export function ImportFab({
  // Must match the page's grid, or the box lands off the column edge — the
  // same contract SiteFooter's widthClassName has, for the same reason.
  widthClassName = 'max-w-[1720px] px-4 sm:px-10',
  // Called after a link actually lands, so the page can pull the feed fresh
  // and the new card appears without a reload.
  onSaved,
}: {
  widthClassName?: string
  onSaved?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const inputRef = useRef<HTMLInputElement | null>(null)
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // preventScroll: same lesson as /start — an autofocused control at the
  // bottom of the page must not yank the viewport down to itself.
  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true })
  }, [open])

  useEffect(() => () => { if (messageTimer.current) clearTimeout(messageTimer.current) }, [])

  const settle = (kind: 'saved' | 'skipped' | 'invalid' | 'failed') => {
    setStatus({ kind })
    if (messageTimer.current) clearTimeout(messageTimer.current)
    messageTimer.current = setTimeout(() => {
      setStatus({ kind: 'idle' })
      inputRef.current?.focus({ preventScroll: true })
    }, MESSAGE_MS)
  }

  const close = () => {
    setOpen(false)
    setValue('')
    setStatus({ kind: 'idle' })
    if (messageTimer.current) clearTimeout(messageTimer.current)
  }

  const submit = async (raw: string) => {
    if (status.kind === 'saving') return
    const url = parseOneUrl(raw)
    if (!url) {
      if (raw.trim()) settle('invalid')
      return
    }
    setStatus({ kind: 'saving' })
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.saved) {
        setValue('')
        settle('saved')
        onSaved?.()
      } else if (res.ok && body.skipped) {
        setValue('')
        settle('skipped')
      } else {
        settle('failed')
      }
    } catch {
      settle('failed')
    }
  }

  const busy = status.kind === 'saving'
  const message = status.kind !== 'idle' && status.kind !== 'saving' ? MESSAGES[status.kind] : null

  return (
    // The wrapper spans the viewport so its inner row can be centred on the
    // grid; it must not swallow clicks meant for the feed underneath, hence
    // pointer-events-none here and auto on the box itself.
    <div
      className="pointer-events-none fixed inset-x-0 z-40"
      style={{ bottom: FOOTER_CLEARANCE }}
    >
      <div className={`mx-auto flex ${widthClassName} justify-end`}>
        {/* One element morphs between both dresses: 56/64px tile closed, a bar
            open (full grid width on phones, 420px from sm up). Radius, frost,
            and shadow ride through the width transition untouched, so it reads
            as the box stretching, not a swap. */}
        <div
          className={`pointer-events-auto flex h-14 items-center overflow-hidden rounded-[18px] transition-[width] duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] sm:h-16 sm:rounded-[20px] ${
            open ? 'w-full sm:w-[420px]' : 'w-14 sm:w-16'
          }`}
          style={{
            // The closed tile's frost, per the handoff. Open adds a milk layer
            // underneath: Cardo at 16px needs a calmer ground than raw blur
            // when the bar happens to sit over a photo card.
            background: open
              ? 'linear-gradient(rgba(255,255,255,0.6), rgba(255,255,255,0.6)), radial-gradient(140% 140% at 0% 0%, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.067) 77%, rgba(0,0,0,0) 100%)'
              : 'radial-gradient(140% 140% at 0% 0%, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.067) 77%, rgba(0,0,0,0) 100%)',
            boxShadow: 'inset 0.93px 7.45px 10.25px rgba(255,255,255,0.55)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          {open ? (
            <>
              {/* The paste field, in Cardo (.font-serif). 16px on phones so iOS
                  doesn't zoom-jump on focus; the message states borrow the same
                  slot so nothing shifts. */}
              {message ? (
                <span className="flex-1 truncate pl-5 font-serif text-[16px] tracking-[-0.01em] text-black/60">
                  {message}
                </span>
              ) : (
                <input
                  ref={inputRef}
                  type="url"
                  value={value}
                  disabled={busy}
                  placeholder="Paste a link"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  aria-label="Paste a link to save"
                  data-1p-ignore
                  data-lpignore="true"
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submit(value)
                    if (e.key === 'Escape') close()
                  }}
                  // Paste-and-done: a valid link on the clipboard saves the
                  // moment it lands — open, ⌘V, watch it file itself. Typed
                  // input still goes through Enter.
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text')
                    if (parseOneUrl(pasted)) {
                      e.preventDefault()
                      setValue(pasted.trim())
                      submit(pasted)
                    }
                  }}
                  className={`flex-1 bg-transparent pl-5 font-serif text-[16px] tracking-[-0.01em] text-ink outline-none placeholder:text-black/40 ${
                    busy ? 'animate-pulse text-black/40' : ''
                  }`}
                />
              )}
            </>
          ) : (
            // Closed: the whole tile is the open button.
            <button
              onClick={() => setOpen(true)}
              aria-label="Add a link"
              title="Add a link"
              className="group flex h-full w-full items-center justify-center transition-transform duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.04] active:scale-[0.98]"
            >
              <PlusGlyph className="text-white" />
            </button>
          )}
          {/* The plus rides along in both dresses and rotates 45° into the ×
              when open — the same two bars, never a glyph swap. Ink when open
              (it sits on the milk layer), white when closed (it sits on frost
              over cards). */}
          {open && (
            <button
              onClick={close}
              aria-label="Close"
              className="flex h-full w-14 shrink-0 items-center justify-center sm:w-16"
            >
              <PlusGlyph className="rotate-45 text-ink/60 transition-transform duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)]" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// The plus as two bars rather than a glyph, so the stroke stays exactly 2px
// and the arms stay exactly equal at any size — a font's "+" gives neither.
// Colored via currentColor so the same bars serve plus and ×.
function PlusGlyph({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`relative block h-4 w-4 ${className}`}>
      <span className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 rounded-full bg-current" />
      <span className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 rounded-full bg-current" />
    </span>
  )
}
