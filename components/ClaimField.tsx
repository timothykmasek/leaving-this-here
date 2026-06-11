'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

// Inline handle claim — the front door of onboarding. No auth: a valid claim
// goes straight to /start?handle=<x>, and the handle is only truly reserved
// when the account is created at the end of the flow.
//
// States: idle → checking (debounced 600ms) → ok | taken. "taken" offers
// three alternates as one-tap pills.

type CheckState = 'idle' | 'checking' | 'ok' | 'taken'

export function ClaimField({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [state, setState] = useState<CheckState>('idle')
  const [focus, setFocus] = useState(false)
  const seq = useRef(0)

  const clean = value.trim().toLowerCase()

  useEffect(() => {
    if (!clean) {
      setState('idle')
      return
    }
    setState('checking')
    const mySeq = ++seq.current
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username-check?u=${encodeURIComponent(clean)}`)
        const data = await res.json()
        if (seq.current !== mySeq) return // a newer keystroke superseded us
        setState(data.available ? 'ok' : 'taken')
      } catch {
        if (seq.current === mySeq) setState('ok') // fail open; re-checked at signup
      }
    }, 600)
    return () => clearTimeout(t)
  }, [clean])

  const go = (handle?: string) => {
    const h = (handle || clean).trim()
    if (!h) return
    if (!handle && state !== 'ok') return
    router.push(`/start?handle=${encodeURIComponent(h)}`)
  }

  const border =
    state === 'ok'
      ? 'border-emerald-700/60'
      : state === 'taken'
        ? 'border-orange-700/50'
        : focus
          ? 'border-ink/60'
          : 'border-stone-300'

  return (
    <div className="w-full max-w-md mx-auto">
      <div
        className={`flex items-stretch border ${border} rounded-full bg-white/80 overflow-hidden transition-colors`}
      >
        <span className="flex items-center pl-5 pr-1 font-mono text-sm text-stone-400 select-none">
          according-to.com/
        </span>
        <input
          type="text"
          value={value}
          placeholder="yourname"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={autoFocus}
          onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
          className="flex-1 min-w-0 py-3 pr-1 font-mono text-sm bg-transparent focus:outline-none text-ink"
        />
        <span className="flex items-center pr-1.5">
          {state === 'checking' && (
            <span className="text-[11px] uppercase tracking-wider text-stone-400 px-2 animate-pulse">
              checking
            </span>
          )}
          {state === 'ok' && (
            <span className="text-[11px] uppercase tracking-wider text-emerald-700 px-2">
              ✓ yours
            </span>
          )}
          {state === 'taken' && (
            <span className="text-[11px] uppercase tracking-wider text-orange-700 px-2">
              taken
            </span>
          )}
        </span>
        <button
          onClick={() => go()}
          disabled={state !== 'ok'}
          aria-label="Claim and start"
          className="m-1 px-4 rounded-full bg-ink text-paper text-base disabled:opacity-30 transition-opacity"
        >
          →
        </button>
      </div>

      {state === 'taken' ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {[`${clean}hq`, `${clean}-co`, `the${clean}`].map((alt) => (
            <button
              key={alt}
              onClick={() => setValue(alt)}
              className="px-3 py-1.5 rounded-full border border-stone-300 bg-white/60 font-mono text-xs text-stone-600 hover:border-stone-500 transition-colors"
            >
              according-to.com/{alt}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-stone-400">
          type a name, hit <b className="text-stone-500">enter</b> — your page is ready in about a minute.
        </p>
      )}
    </div>
  )
}
