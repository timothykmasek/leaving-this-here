'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { INVITE_ONLY, APPLE_WEB_SIGNIN } from '@/lib/beta'
import { BulletinHeader } from '@/components/BulletinHeader'
import { PrimaryCard } from '@/components/PrimaryCard'
import { Masonry } from '@/components/Masonry'
import { LINK_ICONS } from '@/components/ProfileIdentity'
import { coerceUrl, detectPlatform, linkLabel } from '@/lib/profileLinks'
import { seedImageUrl, pickPool, isInterest, INTERESTS, INTEREST_LABEL, type Interest } from '@/lib/seedLibrary'
import { CHROME_STORE_URL as WEB_STORE_URL, IOS_APP_URL } from '@/lib/extension'

// Account-first onboarding (no AI). The account is created at step 1, so every
// step after it runs with a real session — none of the localStorage-across-auth
// gymnastics the old magic-first flow needed.
//
//   1. account    Google | Apple | emailed sign-in link → authenticated
//   2. username   yourbulletin.com/<handle>            → live availability
//   3. about      name + bio + links (the profile's own fields) → typed, no AI
//   4. interests  pick 2–3 topics                      → filters the picks
//   5. pick 3     seed-library grid (live PrimaryCards) → real bookmarks
//   6. building   POST /api/onboarding/setup           → profile + bullets + list
//   7. anywhere   Chrome · iPhone · Claude             → /<username>
//
// The only redirect is OAuth (step 1); /auth/callback sends a no-profile user
// back to /start, where we detect "authed + no profile" and resume at the
// username step.

const STORE_KEY = 'bulletin-onboarding'

// Max bio length — the profile editor's cap, so onboarding can't write a bio
// the editor would then truncate.
const BIO_MAX = 120

type Step = 'account' | 'username' | 'about' | 'interests' | 'picks' | 'building' | 'check-email' | 'ext' | 'invite-only'

function titlecase(s: string): string {
  return s.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

function loadState(): { handle?: string; displayName?: string; bio?: string; links?: string[]; interests?: Interest[]; picks?: string[] } {
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
  const [links, setLinks] = useState<string[]>([])
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
    if (saved.bio) setBio(saved.bio.slice(0, BIO_MAX))
    if (Array.isArray(saved.links)) setLinks(saved.links.filter((u): u is string => typeof u === 'string'))
    if (Array.isArray(saved.interests)) setInterests(saved.interests.filter(isInterest).slice(0, 3))
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
        // During the beta, "authed + no profile" means not on the guest list
        // (profiles are only minted by the invite script) — end the session
        // rather than resuming a wizard that would mint them one.
        if (INVITE_ONLY) {
          await supabase.auth.signOut()
          setStep('invite-only')
        } else {
          setStep('username')
        }
      } else {
        setStep(INVITE_ONLY ? 'invite-only' : 'account')
      }
      setBooting(false)
    })()
  }, [supabase, router])

  // Each step swaps in place on the same page, so scroll position is shared.
  // Reset to the top on every step change so a step can never inherit a
  // scrolled-down position (header off-screen) from the previous one.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [step])

  // Mirror to localStorage for refresh-resilience (not load-bearing).
  useEffect(() => {
    if (booting) return
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ handle, displayName, bio, links, interests, picks }))
    } catch {}
  }, [booting, handle, displayName, bio, links, interests, picks])

  const showBack = step === 'about' || step === 'interests' || step === 'picks'
  const back = () =>
    setStep(step === 'picks' ? 'interests' : step === 'interests' ? 'about' : 'username')
  const wide = step === 'picks'

  return (
    <main className="min-h-screen text-ink">
      <BulletinHeader action={null} logoClassName="h-[32px] sm:h-[40px]" />

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
          <Account supabase={supabase} onCheckEmail={() => setStep('check-email')} />
        ) : step === 'username' ? (
          <Username value={handle} onChange={setHandle} onNext={() => setStep('about')} />
        ) : step === 'about' ? (
          <About
            handle={handle}
            displayName={displayName}
            bio={bio}
            links={links}
            setDisplayName={setDisplayName}
            setBio={setBio}
            setLinks={setLinks}
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
            links={links}
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
        ) : step === 'invite-only' ? (
          <InviteOnly />
        ) : (
          <Anywhere onDone={() => router.push(`/${username}`)} />
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
    <h1 className="font-sans text-[28px] font-normal leading-[1.12] text-ink sm:text-[32px]">
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

/* ── 00 · invite-only ─────────────────────────────────────────────────── */
// The beta's front door for anyone the invite script hasn't let in yet:
// shown instead of the wizard while INVITE_ONLY, and by Account if Supabase
// ever rejects a signup outright. Same optimistic waitlist capture as the
// landing page.

function InviteOnly({ initialEmail = '' }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [requested, setRequested] = useState(false)

  const requestAccess = (e: React.FormEvent) => {
    e.preventDefault()
    fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
      keepalive: true,
    }).catch(() => {})
    setRequested(true)
  }

  return (
    <div>
      <Headline>Bulletin is invite-only right now.</Headline>
      <Sub>
        We&rsquo;re letting people in a few at a time. Leave your email and
        we&rsquo;ll be in touch.
      </Sub>

      {requested ? (
        <p className="mt-7 text-sm text-black/55">You&rsquo;re on the list.</p>
      ) : (
        <form onSubmit={requestAccess} className="mt-7 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className={fieldClass}
          />
          <button type="submit" className={primaryBtn}>
            request access →
          </button>
        </form>
      )}

      <p className="mt-6 text-sm text-black/40">
        already invited?{' '}
        <Link href="/login" className="text-ink underline underline-offset-4">
          sign in
        </Link>
      </p>
    </div>
  )
}

/* ── 01 · account ─────────────────────────────────────────────────────── */

function Account({
  supabase,
  onCheckEmail,
}: {
  supabase: ReturnType<typeof createClient>
  onCheckEmail: () => void
}) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // With "Allow new users to sign up" off in Supabase, the OTP signup is
  // rejected with a "Signups not allowed" style message. Raw red text is
  // terrible manners for an uninvited visitor — swap the whole step for a soft
  // invite-only landing with the same waitlist capture as the homepage.
  const [inviteOnly, setInviteOnly] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)

  const oauth = async (provider: 'google' | 'apple') => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
  }

  // Passwordless: the email lane sends a sign-in link that creates the
  // account (shouldCreateUser true — /login's version of this call is the
  // gate-keeping one with it false). Clicking the link lands on
  // /auth/callback, which sends an authed no-profile user back here to resume
  // at the username step.
  const emailSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setBusy(false)
    if (error) {
      if (/signup|not allowed/i.test(error.message)) {
        setInviteOnly(true)
        return
      }
      setError(
        error.message.includes('rate') || error.message.includes('security')
          ? 'Please wait a moment before trying again.'
          : error.message
      )
      return
    }
    onCheckEmail()
  }

  if (inviteOnly) {
    return <InviteOnly initialEmail={email} />
  }

  // Google and Apple are the doors, side by side and equal (Apple's own rule
  // for its button, and the iOS app offers both). Email is the quiet fallback:
  // a text link that opens the field, not a third big button.
  const socialBtn =
    'flex w-full items-center justify-center gap-2.5 rounded-full border border-black/15 bg-white px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-black/40'

  return (
    <div>
      <Headline>Links to keep, lists to share.</Headline>

      <div className="mt-7 space-y-2.5">
        <button onClick={() => oauth('google')} className={socialBtn}>
          <GoogleMark />
          Continue with Google
        </button>
        {APPLE_WEB_SIGNIN && (
          <button onClick={() => oauth('apple')} className={socialBtn}>
            <AppleMark />
            Continue with Apple
          </button>
        )}
      </div>

      {emailOpen ? (
        <form onSubmit={emailSignup} className="mt-5 space-y-2.5">
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className={fieldClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full border border-black/15 bg-white px-5 py-3 text-sm font-medium text-ink transition-colors hover:border-black/40 disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>
      ) : (
        <button
          onClick={() => setEmailOpen(true)}
          className="mt-4 w-full text-center text-sm text-black/45 transition-colors hover:text-ink"
        >
          or continue with email
        </button>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <p className="mt-8 text-center text-sm text-black/40">
        Already have an account?{' '}
        <Link href="/login" className="text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  )
}

// The providers' own marks, drawn inline (no image requests on the front door).
function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function AppleMark() {
  return (
    <svg width="15" height="16" viewBox="0 0 814 1000" aria-hidden fill="currentColor">
      <path d="M788 341c-6 4-108 62-108 190 0 149 131 202 135 203-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-164-40c-77 0-104 41-167 41s-106-58-156-128C45 791 0 668 0 551c0-188 122-288 243-288 64 0 117 42 157 42 38 0 98-45 171-45 28 0 128 3 194 97zM554 158c30-36 51-85 51-135 0-7-1-14-2-20-48 2-106 32-140 73-27 31-53 80-53 131 0 8 1 15 2 18 3 0 8 1 13 1 43 0 97-29 129-68z" />
    </svg>
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
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the field so it's ready to type — but NOT with the `autoFocus`
  // attribute. On mobile Safari, autofocusing on mount scrolls the input into
  // view, which pushes the BULLETIN header off the top of the screen (and, since
  // /start swaps steps in place without resetting scroll, that scrolled position
  // then carries into every later step). `preventScroll` focuses without moving
  // the page, so the logo stays put.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

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
      ? 'A little longer…'
      : status === 'checking'
      ? 'Checking…'
      : status === 'ok'
      ? `✓ yourbulletin.com/${value} is yours`
      : status === 'no'
      ? reason === 'reserved'
        ? '✕ That one is reserved'
        : reason === 'invalid'
        ? '✕ Letters, numbers and hyphens only'
        : "✕ That one's taken"
      : ''

  return (
    <div>
      <Headline>Pick your handle.</Headline>
      <Sub>This is your home on Bulletin. Share it anywhere.</Sub>

      <div className="mt-6 flex items-stretch overflow-hidden rounded-full border border-black/15 bg-white focus-within:ring-1 focus-within:ring-black/30">
        <span className="flex select-none items-center pl-5 pr-1 text-sm text-black/40">
          yourbulletin.com/
        </span>
        <input
          ref={inputRef}
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
// The profile's own fields, in the profile editor's order and limits (name,
// bio, links), so what they type here is exactly what the pencil opens later.

function About({
  handle,
  displayName,
  bio,
  links,
  setDisplayName,
  setBio,
  setLinks,
  onNext,
}: {
  handle: string
  displayName: string
  bio: string
  links: string[]
  setDisplayName: (v: string) => void
  setBio: (v: string) => void
  setLinks: (v: string[]) => void
  onNext: () => void
}) {
  const [newLink, setNewLink] = useState('')

  useEffect(() => {
    if (!displayName && handle) setDisplayName(titlecase(handle))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addLink = () => {
    const url = coerceUrl(newLink)
    if (!url) return false
    if (!links.includes(url)) setLinks([...links, url])
    setNewLink('')
    return true
  }

  // A valid url still sitting in the add-row rides along on continue, same as
  // the profile editor's save: "type it and hit continue" shouldn't drop it.
  const next = () => {
    addLink()
    onNext()
  }

  return (
    <div>
      <Headline>Introduce yourself.</Headline>
      <Sub>This sits at the top of your page.</Sub>

      <div className="mt-6">
        <label className={fieldLabel}>Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 60))}
          placeholder="Tim Masek"
          className={fieldClass}
        />
      </div>

      <div className="mt-4">
        <label className={fieldLabel}>
          Bio <span className="normal-case text-black/25">(optional)</span>
        </label>
        <input
          value={bio}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
          placeholder="Head of Design @ Pentagram"
          className={fieldClass}
        />
        <div className={`mt-1 text-right text-xs ${bio.length >= BIO_MAX ? 'text-ink' : 'text-black/30'}`}>
          {bio.length}/{BIO_MAX}
        </div>
      </div>

      <div className="mt-1">
        <label className={fieldLabel}>
          Links <span className="normal-case text-black/25">(optional)</span>
        </label>
        <div className="space-y-2.5">
          {links.map((url, i) => (
            <div
              key={`${url}-${i}`}
              className="flex items-center gap-3 rounded-xl border border-black/15 bg-white px-4 py-3"
            >
              <span className="shrink-0 text-black/70">
                {LINK_ICONS[detectPlatform(url)] ?? LINK_ICONS.website}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{linkLabel(url)}</span>
              <button
                type="button"
                onClick={() => setLinks(links.filter((_, j) => j !== i))}
                aria-label={`Remove ${linkLabel(url)}`}
                className="shrink-0 p-1 text-black/30 transition-colors hover:text-ink"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
          <input
            type="text"
            value={newLink}
            onChange={(e) => setNewLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              addLink()
            }}
            onBlur={addLink}
            placeholder="+ Add a link (Instagram, X, your site…)"
            enterKeyHint="done"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-xl border border-dashed border-black/20 bg-transparent px-4 py-3 text-sm text-ink placeholder:text-black/35 focus:border-black/40 focus:outline-none"
          />
        </div>
      </div>

      <button onClick={next} disabled={!displayName.trim()} className={`${primaryBtn} mt-7`}>
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
      <Sub>Pick 2 or 3. We&rsquo;ll pull links to match, so your page starts as yours.</Sub>

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
                    ? 'cursor-not-allowed border-black/10 bg-white text-black/25'
                    : 'border-black/15 bg-white text-ink hover:border-black/40'
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

  const shown = useMemo(() => pickPool(interests), [interests])

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

      {/* The live card, in the profile's own masonry, in its select mode: a
          click toggles instead of opening the link, and the check ring marks
          the picks. The image is the baked seed capture the setup route
          stores, so the card here is the card that lands on their page. */}
      <Masonry>
        {shown.map((L) => (
          <PrimaryCard
            key={L.url}
            id={L.url}
            url={L.url}
            title={L.title}
            imageUrl={null}
            screenshotUrl={seedImageUrl(L)}
            selecting
            selected={picks.includes(L.url)}
            onSelect={toggle}
          />
        ))}
      </Masonry>

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
          build my Bulletin →
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
  links,
  picks,
  onDone,
  onTaken,
}: {
  handle: string
  displayName: string
  bio: string
  links: string[]
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
            links,
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
        setError(data.error || 'Something went wrong building your page.')
      } catch (e: any) {
        clearInterval(iv)
        setError(e?.message || 'Network error. Try again.')
      }
    },
    [displayName, bio, links, picks, onDone]
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
        <Sub>Someone beat you to it. Pick one of these instead:</Sub>
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
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center pt-12 text-center">
      <Ring />
      <h1 className="mt-6 font-sans text-2xl font-bold text-ink">Building your Bulletin…</h1>
      <div className="mt-2 h-4 text-sm text-black/40">{log}</div>
    </div>
  )
}

/* ── check-email (the email lane always lands here) ───────────────────── */

function CheckEmail() {
  return (
    <div className="pt-6 text-center">
      <Headline>Check your email.</Headline>
      <Sub>
        We sent a sign-in link. Click it and you&rsquo;ll come right back to finish your page.
      </Sub>
      <p className="mt-3 text-xs text-black/40">Check spam if you don&rsquo;t see it.</p>
    </div>
  )
}

/* ── 07 · anywhere ───────────────────────────────────────────────────── */
// The last screen: every way into Bulletin besides this tab. Each row opens in
// a new tab so the wizard stays put; the page itself is the one primary action.
// The iPhone row says "Coming soon" until IOS_APP_URL is set (App Store
// approval), then links to the store with no other change.

function Anywhere({ onDone }: { onDone: () => void }) {
  const rows: { title: string; body: string; cta: string; href: string | null }[] = [
    {
      title: 'Chrome extension',
      body: 'One click on any page drops it onto your Bulletin.',
      cta: 'Add to Chrome',
      href: WEB_STORE_URL,
    },
    {
      title: 'iPhone app',
      body: 'Save from the share sheet in any app.',
      cta: IOS_APP_URL ? 'Get the app' : 'Coming soon',
      href: IOS_APP_URL,
    },
    {
      title: 'Claude',
      body: 'Ask Claude to find what you saved, or save links for you.',
      cta: 'Connect',
      href: '/claude',
    },
  ]

  return (
    <div>
      <Headline>Save from anywhere.</Headline>
      <Sub>Bulletin works wherever you find things.</Sub>

      <ul className="mt-6 divide-y divide-black/10 border-y border-black/10">
        {rows.map((r) => (
          <li key={r.title} className="flex items-center gap-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{r.title}</p>
              <p className="mt-0.5 text-sm leading-snug text-black/50">{r.body}</p>
            </div>
            {r.href ? (
              <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-black/40"
              >
                {r.cta}
              </a>
            ) : (
              <span className="shrink-0 px-4 py-2 text-sm text-black/35">{r.cta}</span>
            )}
          </li>
        ))}
      </ul>

      <button onClick={onDone} className={`${primaryBtn} mt-7`}>
        go to my Bulletin →
      </button>
    </div>
  )
}
