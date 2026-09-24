'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google',
  apple: 'Apple',
  email: 'Email link',
}

// Voice: the privacy page's — short sections, plain words. Delete is a
// typed confirmation (the username) so it can't be a mis-click; the server
// checks the same string.
export function SettingsClient({
  username,
  email,
  providers,
}: {
  username: string
  email: string | null
  providers: string[]
}) {
  const router = useRouter()
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const armed = confirm.trim().toLowerCase() === username.toLowerCase()

  const signOut = async () => {
    await createClient().auth.signOut()
    router.push('/')
    router.refresh()
  }

  const deleteAccount = async () => {
    if (!armed || deleting) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: confirm.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Couldn’t delete the account.')
      // The server already dropped the session; clear the client copy too.
      await createClient().auth.signOut().catch(() => {})
      router.push('/')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t delete the account.')
      setDeleting(false)
    }
  }

  const label = 'font-sans font-[600] text-lg text-ink mb-2'
  const body = 'text-[15px] leading-relaxed text-black/70'
  const link = 'text-ink underline underline-offset-4 decoration-black/30 hover:decoration-ink'

  return (
    <div className="space-y-10">
      <section>
        <h2 className={label}>Account</h2>
        <div className={`${body} space-y-1`}>
          <p>
            Signed in as <span className="text-ink">{email ?? username}</span>
          </p>
          <p>
            Sign-in method:{' '}
            <span className="text-ink">
              {providers.length
                ? providers.map((p) => PROVIDER_LABEL[p] ?? p).join(', ')
                : 'Email link'}
            </span>
          </p>
        </div>
      </section>

      <section>
        <h2 className={label}>Profile</h2>
        <p className={body}>
          Your name, bio, and links are edited on{' '}
          <Link href={`/${username}`} className={link}>
            your page
          </Link>
          , under the pencil.
        </p>
      </section>

      <section>
        <h2 className={label}>Your links</h2>
        <div className={`${body} space-y-1`}>
          <p>
            <Link href="/import" className={link}>
              Bulk import
            </Link>{' '}
            links from Pocket, Raindrop, a spreadsheet, or a pasted list.
          </p>
          <p>
            <a href="/api/account/export" download className={link}>
              Export all your links
            </a>{' '}
            as a CSV, every bullet with its lists.
          </p>
        </div>
      </section>

      <section>
        <h2 className={label}>Sign out</h2>
        <p className={body}>
          <button type="button" onClick={signOut} className={link}>
            Sign out of Bulletin
          </button>{' '}
          on this browser. Your bullets and lists stay.
        </p>
      </section>

      <section>
        <h2 className={label}>Delete account</h2>
        <div className={`${body} space-y-4`}>
          <p>
            This removes your account, every bullet you saved, and every list you
            published. Your page at yourbulletin.com/{username} goes away. There
            is no undo.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-[13px] text-black/50">
              Type <span className="text-ink">{username}</span> to confirm
            </span>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full max-w-xs rounded-lg border border-black/15 bg-white px-3 py-2 text-[15px] text-ink outline-none focus:border-ink"
            />
          </label>
          <button
            type="button"
            onClick={deleteAccount}
            disabled={!armed || deleting}
            className="rounded-lg bg-ink px-4 py-2 text-[14px] font-[600] text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            {deleting ? 'Deleting…' : 'Delete my account'}
          </button>
          {error && <p className="text-[14px] text-[#a31f34]">{error}</p>}
        </div>
      </section>
    </div>
  )
}
