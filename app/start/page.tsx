'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

// Magic-first onboarding. The page is BUILT before the account exists:
//
//   /?claim → questions (3, two chain a follow-up) → socials → generating
//   → account gate ("create an account to SAVE your page")
//   → [auth round-trip: Google redirect or email-confirmation link]
//   → /start?finish=1 → /api/onboarding/complete builds the real page
//   → extension pitch → /<username>?welcome=1
//
// Everything pre-auth persists to localStorage (STORE_KEY) so it survives the
// OAuth redirect and even a leave-for-your-inbox email confirmation.
//
// Haiku-in-the-loop: each answer gets a brief generated acknowledgment (and
// the chained follow-up gets rephrased around the answer) via
// /api/onboarding/react — with the scripted lines below as instant fallbacks,
// so a slow or failed model call never stalls a signup.

const STORE_KEY = 'at-onboarding'

type Answers = {
  topic?: string
  topic_why?: string
  rec?: string
  rec_why?: string
  finale?: string
}
type Socials = { twitter?: string; instagram?: string; linkedin?: string; website?: string }
type Step = 'questions' | 'socials' | 'gen' | 'account' | 'check-email' | 'publishing' | 'ext'

const QUESTIONS = [
  {
    tag: 'what you know',
    ask: 'What do you know more about than most people?',
    placeholder: 'a topic, a field, a niche obsession…',
    key: 'topic' as const,
    followUp: {
      ask: 'Any go-to resource on {a} you’d point people to? A link, newsletter, channel — anything.',
      placeholder: 'paste a link, or just name it',
    },
  },
  {
    tag: 'what you share',
    ask: 'What’s something you’ve recommended lately that people actually thanked you for?',
    placeholder: 'a product, place, tool, show…',
    key: 'rec' as const,
    followUp: {
      ask: 'Where do people find it? Drop the link if you’ve got one.',
      placeholder: 'paste a link (or skip)',
    },
  },
  {
    tag: 'your line',
    ask: 'Last thing. Fill in the blank:\naccording to you, life is better with ___.',
    placeholder: '…with ______',
    key: 'finale' as const,
    followUp: null,
  },
]

// Scripted fallbacks when the Haiku call is slow or down.
const FALLBACK_ACKS = ['noted — keeping that.', 'good. that tells me a lot.', 'that’s the one.']

function interpolate(template: string, answer: string) {
  const tok = answer.length <= 28 ? answer.toLowerCase().replace(/[.!?]+$/, '') : 'that'
  return template.replace('{a}', tok)
}

function loadState(): { handle?: string; answers?: Answers; socials?: Socials } {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
  } catch {
    return {}
  }
}
function saveState(patch: Record<string, unknown>) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...loadState(), ...patch }))
  } catch {}
}

export default function StartPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-paper" />}>
      <StartInner />
    </Suspense>
  )
}

function StartInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const [handle, setHandle] = useState<string | null>(null)
  const [step, setStep] = useState<Step | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const answersRef = useRef<Answers>({})
  const socialsRef = useRef<Socials>({})

  // ── Entry routing ────────────────────────────────────────────────────
  useEffect(() => {
    const stored = loadState()
    answersRef.current = stored.answers || {}
    socialsRef.current = stored.socials || {}
    const fromUrl = (searchParams?.get('handle') || '').toLowerCase().replace(/[^a-z0-9-]/g, '')
    const h = fromUrl || stored.handle || null

    const boot = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (searchParams?.get('finish') === '1') {
        // Returning from the auth round-trip (Google or the email link).
        if (!user) { router.replace('/login'); return }
        if (!h) { router.replace('/setup'); return } // state lost (other browser) — old wizard still works
        setHandle(h)
        setStep('publishing')
        return
      }

      if (user) {
        // Signed-in visitors don't re-onboard; with a profile they go home.
        const { data: profile } = await supabase
          .from('profiles').select('username').eq('id', user.id).single()
        if (profile) { router.replace(`/${profile.username}`); return }
      }
      if (!h) { router.replace('/'); return }
      saveState({ handle: h })
      setHandle(h)
      setStep('questions')
    }
    boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── The publish step (post-auth) ─────────────────────────────────────
  const [publishError, setPublishError] = useState<string | null>(null)
  const [takenAlts, setTakenAlts] = useState<string[] | null>(null)
  const publish = async (overrideHandle?: string) => {
    const h = overrideHandle || handle
    if (!h) return
    setPublishError(null)
    setTakenAlts(null)
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: h, answers: answersRef.current, socials: socialsRef.current }),
      })
      const data = await res.json()
      if (res.status === 409) {
        setTakenAlts([`${h}hq`, `${h}-co`, `the${h}`])
        return
      }
      if (!res.ok) throw new Error(data.error || 'something went wrong')
      try { localStorage.removeItem(STORE_KEY) } catch {}
      setUsername(data.username)
      setStep('ext')
    } catch (err: any) {
      setPublishError(err?.message || 'something went wrong publishing your page')
    }
  }
  useEffect(() => {
    if (step === 'publishing') publish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  if (!step) return <main className="min-h-screen bg-paper" />

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-xl px-6 py-14 sm:px-8">
        {step === 'questions' && (
          <Questions
            onDone={(answers) => {
              answersRef.current = answers
              saveState({ answers })
              setStep('socials')
            }}
          />
        )}
        {step === 'socials' && (
          <SocialsStep
            onDone={(socials) => {
              socialsRef.current = socials
              saveState({ socials })
              setStep('gen')
            }}
          />
        )}
        {step === 'gen' && (
          <Generating
            onDone={async () => {
              // Already signed in (e.g. came back mid-flow) → skip the gate.
              const { data: { user } } = await supabase.auth.getUser()
              setStep(user ? 'publishing' : 'account')
            }}
          />
        )}
        {step === 'account' && (
          <AccountGate
            handle={handle!}
            supabase={supabase}
            onSession={() => setStep('publishing')}
            onCheckEmail={() => setStep('check-email')}
          />
        )}
        {step === 'check-email' && <CheckEmail />}
        {step === 'publishing' && (
          <Publishing error={publishError} takenAlts={takenAlts} onRetry={publish} />
        )}
        {step === 'ext' && (
          <ExtensionPitch onDone={() => router.push(`/${username}?welcome=1`)} />
        )}
      </div>
    </main>
  )
}

/* ── questions thread ─────────────────────────────────────────────────── */

type Msg = { who: 'ai' | 'me'; text: string; big?: boolean }

function Questions({ onDone }: { onDone: (a: Answers) => void }) {
  const [thread, setThread] = useState<Msg[]>([
    { who: 'ai', text: QUESTIONS[0].ask, big: true }
  ])
  const [qi, setQi] = useState(0)
  const [phase, setPhase] = useState<'ask' | 'follow'>('ask')
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const answers = useRef<Answers>({})
  const taRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const q = QUESTIONS[qi]
  const live = phase === 'follow' && q.followUp ? q.followUp : q

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [thread, typing])
  useEffect(() => {
    taRef.current?.focus()
  }, [qi, phase, typing])

  // Detect if answer contains a URL
  const hasUrl = (text: string): boolean => {
    return /https?:\/\/|[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?/i.test(text)
  }

  // Ask Haiku for warmth; fall back to scripts if it's slow (>2.2s) or down.
  const react = async (
    question: string,
    answer: string,
    followTemplate: string | null
  ): Promise<{ ack: string; followUp: string | null }> => {
    const fallback = {
      ack: FALLBACK_ACKS[qi % FALLBACK_ACKS.length],
      followUp: followTemplate ? interpolate(followTemplate, answer) : null,
    }
    try {
      const res = (await Promise.race([
        fetch('/api/onboarding/react', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, answer, follow_up: followTemplate }),
        }).then((r) => r.json()),
        new Promise((resolve) => setTimeout(() => resolve(null), 2200)),
      ])) as { ack?: string; followUp?: string } | null
      return {
        ack: res?.ack || fallback.ack,
        followUp: followTemplate ? res?.followUp || fallback.followUp : null,
      }
    } catch {
      return fallback
    }
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || typing) return
    setThread((t) => [...t.map((m) => ({ ...m, big: false })), { who: 'me', text }])
    setDraft('')
    setTyping(true)

    if (phase === 'ask' && q.followUp) {
      answers.current[q.key] = text
      // If answer contains a URL, skip the follow-up (they already gave us the link)
      if (hasUrl(text)) {
        (answers.current as any)[`${q.key}_why`] = text
        const { ack } = await react(q.ask, text, null)
        setTyping(false)
        const next = qi + 1
        if (next < QUESTIONS.length) {
          setThread((t) => [
            ...t,
            { who: 'ai', text: ack },
            { who: 'ai', text: QUESTIONS[next].ask, big: true },
          ])
          setQi(next)
          setPhase('ask')
        } else {
          setThread((t) => [...t, { who: 'ai', text: ack }])
          setTimeout(() => onDone(answers.current), 700)
        }
        return
      }
      const { ack, followUp } = await react(q.ask, text, q.followUp.ask)
      setTyping(false)
      setThread((t) => [
        ...t,
        { who: 'ai', text: ack },
        { who: 'ai', text: followUp || interpolate(q.followUp!.ask, text), big: true },
      ])
      setPhase('follow')
      return
    }

    if (phase === 'ask') answers.current[q.key] = text
    else (answers.current as any)[`${q.key}_why`] = text

    const { ack } = await react(live.ask, text, null)
    setTyping(false)

    const next = qi + 1
    if (next < QUESTIONS.length) {
      setThread((t) => [
        ...t,
        { who: 'ai', text: ack },
        { who: 'ai', text: QUESTIONS[next].ask, big: true },
      ])
      setQi(next)
      setPhase('ask')
    } else {
      setThread((t) => [...t, { who: 'ai', text: ack }])
      setTimeout(() => onDone(answers.current), 700)
    }
  }

  return (
    <div>
      <div className="space-y-5 mb-8">
        {thread.map((m, i) =>
          m.who === 'me' ? (
            <div key={i} className="flex justify-end">
              <span className="max-w-[85%] rounded-2xl rounded-br-md bg-ink/90 px-4 py-2.5 text-sm text-paper">
                {m.text}
              </span>
            </div>
          ) : m.big ? (
            <div key={i}>
              <h2 className="font-serif text-2xl leading-snug text-ink whitespace-pre-line sm:text-[1.65rem]">
                {m.text}
              </h2>
            </div>
          ) : (
            <p key={i} className="text-sm text-stone-400">
              {m.text}
            </p>
          )
        )}
        {typing && (
          <p className="text-sm text-stone-400">
            <span className="inline-flex gap-1">
              <i className="h-1.5 w-1.5 rounded-full bg-stone-400 animate-bounce [animation-delay:0ms]" />
              <i className="h-1.5 w-1.5 rounded-full bg-stone-400 animate-bounce [animation-delay:120ms]" />
              <i className="h-1.5 w-1.5 rounded-full bg-stone-400 animate-bounce [animation-delay:240ms]" />
            </span>
          </p>
        )}
        <div ref={endRef} />
      </div>

      {!typing && (
        <div>
          <div className="flex items-end gap-2 rounded-2xl border border-stone-300 bg-white/80 p-2 focus-within:border-ink/60 transition-colors">
            <textarea
              ref={taRef}
              rows={1}
              value={draft}
              placeholder={live.placeholder}
              onChange={(e) => {
                setDraft(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-ink focus:outline-none"
            />
            <button
              onClick={send}
              disabled={!draft.trim()}
              aria-label="Send"
              className="h-10 w-10 shrink-0 rounded-full bg-ink text-paper disabled:opacity-30 transition-opacity"
            >
              →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── socials ──────────────────────────────────────────────────────────── */

const SOCIAL_FIELDS = [
  { key: 'twitter' as const, base: 'x.com/', ph: 'handle' },
  { key: 'instagram' as const, base: 'instagram.com/', ph: 'handle' },
  { key: 'linkedin' as const, base: 'linkedin.com/in/', ph: 'you' },
  { key: 'website' as const, base: '', ph: 'yourwebsite.com' },
]

function SocialsStep({ onDone }: { onDone: (s: Socials) => void }) {
  const [vals, setVals] = useState<Socials>({})
  const filled = Object.values(vals).some((v) => v && v.trim())
  return (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-stone-400 font-serif">
        one quick thing · find you elsewhere
      </p>
      <h2 className="font-serif text-2xl text-ink mb-2">
        Where else do people <em className="italic text-stone-600">find you?</em>
      </h2>
      <p className="text-sm text-stone-500 mb-8">
        These show up on your page so visitors can follow the thread. Add what you
        want — skip the rest.
      </p>

      <div className="space-y-3 mb-8">
        {SOCIAL_FIELDS.map((f) => {
          const v = vals[f.key] || ''
          return (
            <label
              key={f.key}
              className={`flex items-center rounded-full border bg-white/80 px-5 py-3 transition-colors ${
                v.trim() ? 'border-emerald-700/50' : 'border-stone-300 focus-within:border-ink/60'
              }`}
            >
              {f.base && <span className="font-mono text-sm text-stone-400 select-none">{f.base}</span>}
              <input
                value={v}
                placeholder={f.ph}
                spellCheck={false}
                autoCapitalize="none"
                onChange={(e) => setVals((s) => ({ ...s, [f.key]: e.target.value }))}
                className="flex-1 min-w-0 bg-transparent font-mono text-sm text-ink focus:outline-none pl-0.5"
              />
              {v.trim() && <span className="text-emerald-700 text-sm">✓</span>}
            </label>
          )
        })}
      </div>

      <button
        onClick={() => onDone(vals)}
        className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper hover:bg-ink/85 transition-colors"
      >
        {filled ? 'build my page →' : 'skip — build my page →'}
      </button>
    </div>
  )
}

/* ── generating beat ──────────────────────────────────────────────────── */

const GEN_STEPS = ['reading your answers', 'writing your bio', 'naming your first list', 'lining up your finds']

function Generating({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (step >= GEN_STEPS.length) {
      const t = setTimeout(onDone, 450)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setStep((s) => s + 1), 620)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])
  return (
    <div className="pt-10 text-center">
      <h2 className="font-serif text-2xl text-ink mb-8">
        Building your <em className="italic text-stone-600">page…</em>
      </h2>
      <div className="mx-auto max-w-xs space-y-3 text-left">
        {GEN_STEPS.map((s, i) => (
          <div
            key={s}
            className={`flex items-center gap-3 text-sm transition-opacity ${
              i < step ? 'text-stone-500' : i === step ? 'text-ink' : 'text-stone-300'
            }`}
          >
            <span className="w-4 text-emerald-700">{i < step ? '✓' : ''}</span>
            {s}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── account gate ─────────────────────────────────────────────────────── */

function AccountGate({
  handle,
  supabase,
  onSession,
  onCheckEmail,
}: {
  handle: string
  supabase: ReturnType<typeof createClient>
  onSession: () => void
  onCheckEmail: () => void
}) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setError(error.message)
      return
    }
    // Confirmations on → no session yet; the email link returns via
    // /auth/callback → /start?finish=1 and localStorage carries the page.
    if (data.session) onSession()
    else onCheckEmail()
  }

  const google = async () => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
  }

  return (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-stone-400 font-serif">
        one quick step
      </p>
      <h2 className="font-serif text-2xl text-ink mb-2">
        Create your account to <em className="italic text-stone-600">publish and save.</em>
      </h2>
      <p className="text-sm text-stone-500 mb-8">
        Your bio, first list and finds are ready. Make an account to keep them and
        publish <span className="font-mono text-stone-600">according-to.com/{handle}</span>.
      </p>

      <button
        onClick={google}
        className="w-full rounded-full border border-stone-300 bg-white/60 px-6 py-3 text-sm font-medium text-ink hover:border-stone-500 transition-colors mb-4"
      >
        continue with google
      </button>

      <div className="relative mb-4">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-stone-300/70" /></div>
        <div className="relative flex justify-center"><span className="bg-paper px-3 text-xs text-stone-400">or email</span></div>
      </div>

      <form onSubmit={emailSignup} className="space-y-4 mb-6">
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-stone-400">email</label>
          <input
            type="email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-stone-300 bg-white/80 px-4 py-2.5 text-sm focus:outline-none focus:border-ink/60"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-stone-400">password</label>
          <input
            type="password"
            value={pw}
            required
            minLength={6}
            onChange={(e) => setPw(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-stone-300 bg-white/80 px-4 py-2.5 text-sm focus:outline-none focus:border-ink/60"
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper hover:bg-ink/85 disabled:opacity-60 transition-colors"
        >
          {busy ? 'creating…' : 'create account & publish'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-400">
        already have an account?{' '}
        <Link href="/login" className="text-ink underline underline-offset-4">sign in</Link>
      </p>
    </div>
  )
}

function CheckEmail() {
  return (
    <div>
      <h2 className="font-serif text-2xl text-ink mb-4">check your email</h2>
      <p className="text-sm text-stone-600 mb-8">
        Click the confirmation link. Takes about a minute.
      </p>
      <p className="text-xs text-stone-400">
        It goes to your inbox — check spam if you don't see it. Once you confirm, your page publishes and you can start saving with the extension.
      </p>
    </div>
  )
}

/* ── publishing (the attach call) ─────────────────────────────────────── */

function Publishing({
  error,
  takenAlts,
  onRetry,
}: {
  error: string | null
  takenAlts: string[] | null
  onRetry: (h?: string) => void
}) {
  if (takenAlts) {
    return (
      <div className="pt-10 text-center">
        <h2 className="font-serif text-2xl text-ink mb-3">that handle just got taken</h2>
        <p className="text-sm text-stone-500 mb-6">someone beat you to it — pick a fallback:</p>
        <div className="flex flex-wrap justify-center gap-2">
          {takenAlts.map((alt) => (
            <button
              key={alt}
              onClick={() => onRetry(alt)}
              className="rounded-full border border-stone-300 bg-white/70 px-4 py-2 font-mono text-xs text-stone-600 hover:border-stone-500"
            >
              according-to.com/{alt}
            </button>
          ))}
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="pt-10 text-center">
        <h2 className="font-serif text-2xl text-ink mb-3">hmm, that didn&rsquo;t take</h2>
        <p className="text-sm text-red-700 mb-6">{error}</p>
        <button
          onClick={() => onRetry()}
          className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper hover:bg-ink/85"
        >
          try again
        </button>
      </div>
    )
  }
  return (
    <div className="pt-10 text-center">
      <h2 className="font-serif text-2xl text-ink mb-3">
        Publishing your <em className="italic text-stone-600">page…</em>
      </h2>
      <p className="text-sm text-stone-400 animate-pulse">writing the bio, saving your finds</p>
    </div>
  )
}

/* ── extension pitch ──────────────────────────────────────────────────── */

// Chrome Web Store URL for the published extension (v0.1 onward)
const WEB_STORE_URL = 'https://chrome.google.com/webstore/detail/according-to-save-anything/jmncmjodlkhpbakjdbokpkpfpolokijf'

function ExtensionPitch({ onDone }: { onDone: () => void }) {
  return (
    <div>
      <h2 className="font-serif text-2xl text-ink mb-6">
        One more step: add the <em className="italic text-stone-600">extension</em>.
      </h2>
      <p className="text-sm text-stone-500 mb-8">
        The extension is how you save. Click it on any page, pick a list, and the link lands on your page instantly.
      </p>

      <div className="rounded-2xl border border-stone-300 bg-stone-50 p-6 mb-8">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-stone-400 font-serif mb-3">how to install</p>
            <ol className="space-y-3">
              {[
                ['open the Chrome Web Store', 'search for "according to — save anything"'],
                ['click Add to Chrome', 'it\'s free, no login needed yet'],
                ['pin it to your toolbar', 'click the puzzle icon in Chrome, then the pin next to according to'],
              ].map(([step, detail], i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 font-serif text-stone-400 text-sm leading-tight">{i + 1}.</span>
                  <div className="text-sm leading-snug">
                    <p className="text-ink font-medium">{step}</p>
                    <p className="text-stone-500">{detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start gap-3">
        {WEB_STORE_URL ? (
          <a
            href={WEB_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setTimeout(onDone, 400)}
            className="rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper hover:bg-ink/85 transition-colors"
          >
            open Chrome Web Store
          </a>
        ) : null}
        <button
          onClick={onDone}
          className="text-sm text-stone-500 hover:text-stone-700 underline"
        >
          {WEB_STORE_URL ? 'skip for now' : 'continue to my page'}
        </button>
      </div>
    </div>
  )
}
