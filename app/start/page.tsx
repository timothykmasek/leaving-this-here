'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BulletinHeader } from '@/components/BulletinHeader'
import { SEED_LIBRARY, seedImageUrl, CATEGORY, INTERESTS, INTEREST_LABEL, type Interest } from '@/lib/seedLibrary'

// Account-first onboarding (no AI). The account is created at step 1, so every
// step after it runs with a real session — none of the localStorage-across-auth
// gymnastics the old magic-first flow needed.
//
//   1. account   Google | email + password        → authenticated
//   2. username  yourbulletin.com/<handle>          → live availability
//   3. about     display name + bio                 → typed, no AI
//   4. pick 3    seed-library grid (real cards)      → real bookmarks
//   5. building  POST /api/onboarding/setup          → profile + bullets + list
//   6. extension pitch                               → /<username>
//
// The only redirect is Google OAuth (step 1); /auth/callback sends a no-profile
// user back to /start, where we detect "authed + no profile" and resume at the
// username step.

const STORE_KEY = 'bulletin-onboarding'
const WEB_STORE_URL =
  'https://chrome.google.com/webstore/detail/according-to-save-anything/dgpigmcmbffpoigjalnbgfmpgidoabgc'

type Step = 'account' | 'username' | 'about' | 'interests' | 'picks' | 'building' | 'check-email' | 'ext'

function titlecase(s: string): string {
  return s.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

function loadState(): { handle?: string; displayName?: string; bio?: string; interests?: Interest[]; picks?: string[] } {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
  } catch {
    return {}
  }
}

export default function StartPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [booting, setBooting] = useState(true)
  const [step, setStep] = useState<Step>('account')
  const [handle, setHandle] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  // Interests picked in the new interests-first step; the picks grid filters to
  // seed links matching these. `picks` holds the chosen seed URLs (not indices,
  // so filtering the grid can't shuffle the selection out from under the user).
  const [interests, setInterests] = useState<Interest[]>([])
  const [picks, setPicks] = useState<string[]>([])
  const [username, setUsername] = useState('')

  // Resume from a refresh + decide the entry step from auth state.
  useEffect(() => {
    const saved = loadState()
    if (saved.handle) setHandle(saved.handle)
    if (saved.displayName) setDisplayName(saved.displayName)
    if (saved.bio) setBio(saved.bio)
    if (Array.isArray(saved.interests)) setInterests(saved.interests.slice(0, 3))
    // picks are seed URLs now (were array indices pre-Tier-B); drop any stale
    // non-string entries so we never POST a number to the setup route.
    if (Array.isArray(saved.picks))
      setPicks(saved.picks.filter((p): p is string => typeof p === 'string').slice(0, 3))

    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .single()
        if (profile) {
          router.replace(`/${profile.username}`)
          return
        }
        setStep('username')
      } else {
        setStep('account')
      }
      setBooting(false)
    })()
  }, [supabase, router])

  // Mirror to localStorage for refresh-resilience (not load-bearing).
  useEffect(() => {
    if (booting) return
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ handle, displayName, bio, interests, picks }))
    } catch {}
  }, [booting, handle, displayName, bio, interests, picks])

  const showBack = step === 'about' || step === 'interests' || step === 'picks'
  const back = () =>
    setStep(step === 'picks' ? 'interests' : step === 'interests' ? 'about' : 'username')
  const wide = step === 'picks'

  return (
    <main className="min-h-screen bg-paper text-ink">
      <BulletinHeader action={null} logoClassName="h-[26px] sm:h-[30px]" />

      <div className={`mx-auto px-6 pb-24 pt-8 ${wide ? 'max-w-[1232px]' : 'max-w-md'}`}>
        {showBack && (
          <button
            onClick={back}
            className="mb-5 text-sm text-black/40 transition-colors hover:text-black/70"
          >
            ← back
          </button>
        )}

        {booting ? (
          <div className="flex justify-center pt-16">
            <Ring />
          </div>
        ) : step === 'account' ? (
          <Account
            supabase={supabase}
            onSession={() => setStep('username')}
            onCheckEmail={() => setStep('check-email')}
          />
        ) : step === 'username' ? (
          <Username value={handle} onChange={setHandle} onNext={() => setStep('about')} />
        ) : step === 'about' ? (
          <About
            handle={handle}
            displayName={displayName}
            bio={bio}
            setDisplayName={setDisplayName}
            setBio={setBio}
            onNext={() => setStep('interests')}
          />
        ) : step === 'interests' ? (
          <Interests interests={interests} setInterests={setInterests} onNext={() => setStep('picks')} />
        ) : step === 'picks' ? (
          <Picks
            interests={interests}
            picks={picks}
            setPicks={setPicks}
            onNext={() => setStep('building')}
          />
        ) : step === 'building' ? (
          <Building
            handle={handle}
            displayName={displayName}
            bio={bio}
            picks={picks}
            onDone={(u) => {
              setUsername(u)
              try {
                localStorage.removeItem(STORE_KEY)
              } catch {}
              setStep('ext')
            }}
            onTaken={(h) => {
              setHandle(h)
              setStep('username')
            }}
          />
        ) : step === 'check-email' ? (
          <CheckEmail />
        ) : (
          <Extension onDone={() => router.push(`/${username}`)} />
        )}
      </div>
    </main>
  )
}

/* ── shared bits ──────────────────────────────────────────────────────── */

function Ring() {
  return (
    <div
      className="h-9 w-9 animate-spin rounded-full border-[3px] border-black/10 border-t-ink"
      aria-label="loading"
    />
  )
}

function Headline({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="font-serif text-[28px] font-bold leading-[1.12] text-ink sm:text-[32px]">
      {children}
    </h1>
  )
}

function Sub({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-black/45">{children}</p>
}

const fieldClass =
  'w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm text-ink placeholder:text-black/35 focus:outline-none focus:ring-1 focus:ring-black/30'

const primaryBtn =
  'w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50'

const fieldLabel = 'mb-1.5 block text-xs uppercase tracking-wider text-black/40'

/* ── 01 · account ─────────────────────────────────────────────────────── */

function Account({
  supabase,
  onSession,
  onCheckEmail,
}: {
  supabase: ReturnType<typeof createClient>
  onSession: () => void
  onCheckEmail: () => void
}) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const google = async () => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
  }

  const emailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setBusy(false)
    if (error) {
      setError(
        error.message.includes('rate') || error.message.includes('security')
          ? 'please wait a moment before trying again'
          : error.message
      )
      return
    }
    // Confirmation OFF → instant session → continue in-page. If it's ever
    // turned ON, signUp returns no session and we fall back to check-email.
    if (data.session) onSession()
    else onCheckEmail()
  }

  return (
    <div>
      <Headline>Make a home for your links.</Headline>
      <Sub>Save anything worth keeping. We&rsquo;ll set up your page in under a minute.</Sub>

      <button
        onClick={google}
        className="mt-7 w-full rounded-full border border-black/15 bg-white px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-black/40"
      >
        Continue with Google
      </button>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-black/10" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-paper px-3 text-xs uppercase tracking-wider text-black/35">or</span>
        </div>
      </div>

      <form onSubmit={emailSignup} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className={fieldClass}
        />
        <input
          type="password"
          required
          minLength={6}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="create a password"
          className={fieldClass}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? 'creating…' : 'create account →'}
        </button>
      </form>

      <p className="mt-6 text-sm text-black/40">
        already have an account?{' '}
        <Link href="/login" className="text-ink underline underline-offset-4">
          sign in
        </Link>
      </p>
    </div>
  )
}

/* ── 02 · username ────────────────────────────────────────────────────── */

function Username({
  value,
  onChange,
  onNext,
}: {
  value: string
  onChange: (v: string) => void
  onNext: () => void
}) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'no' | 'short'>('idle')
  const [reason, setReason] = useState<string>('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onInput = (raw: string) => {
    const v = raw.toLowerCase().replace(/[^a-z0-9-]/g, '')
    onChange(v)
    setReason('')
    if (timer.current) clearTimeout(timer.current)
    if (!v) return setStatus('idle')
    if (v.length < 3) return setStatus('short')
    setStatus('checking')
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username-check?u=${encodeURIComponent(v)}`)
        const data = await res.json()
        if (data.available) {
          setStatus('ok')
        } else {
          setStatus('no')
          setReason(data.reason || 'taken')
        }
      } catch {
        setStatus('ok')
      }
    }, 350)
  }

  const message =
    status === 'short'
      ? 'a little longer…'
      : status === 'checking'
      ? 'checking…'
      : status === 'ok'
      ? `✓ yourbulletin.com/${value} is yours`
      : status === 'no'
      ? reason === 'reserved'
        ? '✕ that one is reserved'
        : reason === 'invalid'
        ? '✕ letters, numbers and hyphens only'
        : "✕ that one's taken"
      : ''

  return (
    <div>
      <Headline>Pick your handle.</Headline>
      <Sub>This is your home on Bulletin — share it anywhere.</Sub>

      <div className="mt-6 flex items-stretch overflow-hidden rounded-full border border-black/15 bg-white focus-within:ring-1 focus-within:ring-black/30">
        <span className="flex select-none items-center pl-5 pr-1 text-sm text-black/40">
          yourbulletin.com/
        </span>
        <input
          autoFocus
          value={value}
          onChange={(e) => onInput(e.target.value)}
          placeholder="yourname"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-3 pr-4 text-sm text-ink placeholder:text-black/35 focus:outline-none"
        />
      </div>
      <div
        className={`mt-2 h-4 px-1 text-xs ${
          status === 'ok' ? 'text-emerald-700' : status === 'no' ? 'text-red-600' : 'text-black/40'
        }`}
      >
        {message}
      </div>

      <button onClick={onNext} disabled={status !== 'ok'} className={`${primaryBtn} mt-5`}>
        continue →
      </button>
    </div>
  )
}

/* ── 03 · about ───────────────────────────────────────────────────────── */

function About({
  handle,
  displayName,
  bio,
  setDisplayName,
  setBio,
  onNext,
}: {
  handle: string
  displayName: string
  bio: string
  setDisplayName: (v: string) => void
  setBio: (v: string) => void
  onNext: () => void
}) {
  useEffect(() => {
    if (!displayName && handle) setDisplayName(titlecase(handle))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <Headline>Introduce yourself.</Headline>
      <Sub>A name and one line — this sits at the top of your page.</Sub>

      <div className="mt-6">
        <label className={fieldLabel}>display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
          placeholder="Tim Masek"
          className={fieldClass}
        />
      </div>

      <div className="mt-4">
        <label className={fieldLabel}>
          bio <span className="normal-case text-black/25">(optional)</span>
        </label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, 140))}
          placeholder="Tools, essays, and rabbit holes for people who make things."
          className={`${fieldClass} min-h-[104px] resize-none leading-relaxed`}
        />
        <div className="mt-1 text-right text-xs text-black/30">{bio.length}/140</div>
      </div>

      <button onClick={onNext} disabled={!displayName.trim()} className={`${primaryBtn} mt-3`}>
        continue →
      </button>
    </div>
  )
}

/* ── 04 · interests ───────────────────────────────────────────────────── */

function Interests({
  interests,
  setInterests,
  onNext,
}: {
  interests: Interest[]
  setInterests: (v: Interest[]) => void
  onNext: () => void
}) {
  const toggle = (k: Interest) => {
    if (interests.includes(k)) setInterests(interests.filter((i) => i !== k))
    else if (interests.length < 3) setInterests([...interests, k])
  }

  return (
    <div>
      <Headline>What are you into?</Headline>
      <Sub>Pick 2&ndash;3 &mdash; we&rsquo;ll pull links to match, so your page starts as yours.</Sub>

      <div className="mt-6 flex flex-wrap gap-2.5">
        {INTERESTS.map(({ key, label }) => {
          const sel = interests.includes(key)
          const full = !sel && interests.length >= 3
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              disabled={full}
              aria-pressed={sel}
              className={`rounded-full border px-4 py-2 text-sm transition-colors ${
                sel
                  ? 'border-ink bg-ink text-white'
                  : full
                    ? 'cursor-not-allowed border-black/10 text-black/25'
                    : 'border-black/15 text-ink hover:border-black/40'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <button onClick={onNext} disabled={interests.length < 2} className={`${primaryBtn} mt-7`}>
        continue →
      </button>
    </div>
  )
}

/* ── 05 · pick 3 ──────────────────────────────────────────────────────── */

function Picks({
  interests,
  picks,
  setPicks,
  onNext,
}: {
  interests: Interest[]
  picks: string[]
  setPicks: (p: string[]) => void
  onNext: () => void
}) {
  const toggle = (url: string) => {
    if (picks.includes(url)) {
      setPicks(picks.filter((p) => p !== url))
    } else if (picks.length < 3) {
      setPicks([...picks, url])
    }
  }

  // Tier B: show only the seed links matching the chosen interests. Fall back to
  // the whole library if somehow no interests were picked (shouldn't happen —
  // the interests step requires ≥2 before continuing).
  const shown =
    interests.length > 0
      ? SEED_LIBRARY.filter((L) => L.interests.some((i) => interests.includes(i)))
      : SEED_LIBRARY

  const because = interests.map((i) => INTEREST_LABEL[i]).filter(Boolean)
  const becauseLine =
    because.length === 1
      ? because[0]
      : because.length === 2
        ? `${because[0]} and ${because[1]}`
        : because.slice(0, -1).join(', ') + ', and ' + because[because.length - 1]

  return (
    <div>
      <div className="mb-7">
        <Headline>Pick 3 to start.</Headline>
        <Sub>
          {because.length ? (
            <>Because you like <span className="text-ink">{becauseLine}</span>. You can swap them anytime.</>
          ) : (
            <>A few favourites so your page isn&rsquo;t empty. You can swap them anytime.</>
          )}
        </Sub>
      </div>

      {/* Same geometry as the live grid (1184px / 4-col / gap-x-8 = 272px cards). */}
      <div className="mx-auto grid w-[1184px] max-w-full grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-12">
        {shown.map((L) => {
          const sel = picks.includes(L.url)
          const pos = picks.indexOf(L.url)
          return (
            <button
              key={L.url}
              onClick={() => toggle(L.url)}
              className={`relative block aspect-[272/270] w-full overflow-hidden rounded-[20px] bg-card text-left shadow-[0_4px_18px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)] ${
                sel ? 'ring-2 ring-ink' : 'ring-1 ring-black/[0.03]'
              }`}
            >
              {/* corner rivets */}
              <Rivet className="left-[7.4%] top-[7.4%]" />
              <Rivet className="right-[7.4%] top-[7.4%]" />
              <Rivet className="bottom-[7.4%] left-[7.4%]" />
              <Rivet className="bottom-[7.4%] right-[7.4%]" />

              {/* selection number */}
              <span
                className={`absolute right-2.5 top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                  sel ? 'bg-ink text-white' : 'border border-black/15 bg-white/80 text-transparent'
                }`}
              >
                {sel ? pos + 1 : ''}
              </span>

              {/* thumbnail — same geometry as LinkCard. A category-coloured
                  block with the domain sits underneath; the baked screenshot
                  covers it when present, and an un-baked domain (img onError)
                  reveals the block instead of a broken image. */}
              <div
                className="absolute left-[16.2%] top-[21.9%] flex aspect-[184/118] w-[67.6%] items-center justify-center overflow-hidden rounded-[10px]"
                style={{ backgroundColor: CATEGORY[L.type].bg }}
              >
                <span
                  className="px-2 text-center text-[10px] font-medium leading-tight"
                  style={{ color: CATEGORY[L.type].fg }}
                >
                  {L.domain}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={seedImageUrl(L)}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>

              {/* title — Cardo bold */}
              <h3 className="absolute left-[16.2%] top-[69%] line-clamp-2 w-[67.6%] font-serif text-[12px] font-bold leading-[13px] text-ink">
                {L.title}
              </h3>
            </button>
          )
        })}
      </div>

      {/* sticky tally / build bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-center justify-center gap-5 bg-gradient-to-t from-paper via-paper/90 to-transparent p-5">
        <span className="pointer-events-auto text-sm text-black/45">
          <b className="font-semibold text-ink">{picks.length}</b> / 3 selected
        </span>
        <button
          onClick={onNext}
          disabled={picks.length !== 3}
          className="pointer-events-auto rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          build my bulletin →
        </button>
      </div>
    </div>
  )
}

/* ── 06 · building ────────────────────────────────────────────────────── */

const BUILD_LOG = [
  'reserving your handle',
  'pulling previews for your picks',
  'placing your first bullets',
  'starting a list for you',
  'tidying your shelf',
]

function Building({
  handle,
  displayName,
  bio,
  picks,
  onDone,
  onTaken,
}: {
  handle: string
  displayName: string
  bio: string
  picks: string[]
  onDone: (username: string) => void
  onTaken: (h: string) => void
}) {
  const [log, setLog] = useState(BUILD_LOG[0])
  const [error, setError] = useState<string | null>(null)
  const [alts, setAlts] = useState<string[] | null>(null)
  const started = useRef(false)

  const run = useCallback(
    async (h: string) => {
      setError(null)
      setAlts(null)
      let n = 0
      const iv = setInterval(() => {
        n = Math.min(n + 1, BUILD_LOG.length - 1)
        setLog(BUILD_LOG[n])
      }, 700)
      try {
        const res = await fetch('/api/onboarding/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            handle: h,
            displayName,
            bio,
            picks,
          }),
        })
        clearInterval(iv)
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.username) {
          onDone(data.username)
          return
        }
        if (res.status === 409 || data.reason === 'taken') {
          setAlts([`${h}hq`, `${h}-co`, `the${h}`])
          return
        }
        setError(data.error || 'something went wrong building your page.')
      } catch (e: any) {
        clearInterval(iv)
        setError(e?.message || 'network error — try again.')
      }
    },
    [displayName, bio, picks, onDone]
  )

  useEffect(() => {
    if (started.current) return
    started.current = true
    run(handle)
  }, [run, handle])

  if (alts) {
    return (
      <div className="pt-6 text-center">
        <Headline>That handle just got taken.</Headline>
        <Sub>someone beat you to it — pick a fallback:</Sub>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {alts.map((alt) => (
            <button
              key={alt}
              onClick={() => onTaken(alt)}
              className="rounded-full border border-black/15 bg-white px-4 py-2.5 text-sm text-black/60 transition-colors hover:border-black/40 hover:text-ink"
            >
              yourbulletin.com/{alt}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="pt-6 text-center">
        <Headline>That didn&rsquo;t take.</Headline>
        <p className="mt-3 text-sm text-red-600">{error}</p>
        <button onClick={() => run(handle)} className={`${primaryBtn} mt-6`}>
          try again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center pt-12 text-center">
      <Ring />
      <h1 className="mt-6 font-serif text-2xl font-bold text-ink">Building your bulletin…</h1>
      <div className="mt-2 h-4 text-sm text-black/40">{log}</div>
    </div>
  )
}

/* ── check-email (fallback only, if confirmation is ever turned on) ─────── */

function CheckEmail() {
  return (
    <div className="pt-6 text-center">
      <Headline>Check your email.</Headline>
      <Sub>
        We sent a confirmation link. Click it and you&rsquo;ll come right back to finish your page.
      </Sub>
      <p className="mt-3 text-xs text-black/40">check spam if you don&rsquo;t see it.</p>
    </div>
  )
}

/* ── 06 · extension ───────────────────────────────────────────────────── */

function Extension({ onDone }: { onDone: () => void }) {
  return (
    <div>
      <Headline>Save from anywhere.</Headline>
      <Sub>
        Add the Bulletin button to your browser. One click on any page drops it straight onto your
        shelf.
      </Sub>
      <ul className="mt-5 space-y-2.5">
        {[
          'Clip articles, videos, products & tweets without leaving the tab.',
          'Auto-pulls the title, image and source for you.',
          'File into a list, or just leave it on your shelf.',
        ].map((t) => (
          <li key={t} className="flex gap-2.5 text-sm leading-snug text-black/55">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-ink" />
            {t}
          </li>
        ))}
      </ul>
      <a
        href={WEB_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setTimeout(onDone, 400)}
        className={`${primaryBtn} mt-7 inline-flex items-center justify-center`}
      >
        add to Chrome — free →
      </a>
      <button
        onClick={onDone}
        className="mt-3 w-full text-sm text-black/40 transition-colors hover:text-black/70"
      >
        maybe later
      </button>
    </div>
  )
}

function Rivet({ className }: { className: string }) {
  return <span aria-hidden className={`absolute h-[7px] w-[7px] rounded-full bg-[#d9d9d9] ${className}`} />
}
