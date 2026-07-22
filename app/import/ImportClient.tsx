'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BulletinHeader } from '@/components/BulletinHeader'

// Bulk import: paste anything (or drop a CSV) → we pull out the URLs → save
// them one at a time through /api/import. Format is deliberately forgiving —
// a Pocket export, a spreadsheet column, or a bare list of links all work,
// because all we need is the URLs.
//
// Heavily throttled by design: one request at a time with a fixed gap, driven
// from this page (no background queue to build or babysit). A few hundred
// links takes a few minutes; the progress bar makes that legible, and the
// per-save pipeline (metadata → screenshot → embedding) never gets slammed.

const MAX_LINKS = 500
const GAP_MS = 1500

// Pull URLs out of arbitrary text. Explicit http(s) first; then bare-domain
// tokens (docs.foo.com/path) on their own CSV cell or line, protocol added.
function extractUrls(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    // Strip trailing punctuation that rides along from CSV/quotes/prose.
    const url = raw.replace(/[)\]}>,;.'"”’]+$/, '')
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
      const key = u.href
      if (seen.has(key)) return
      seen.add(key)
      found.push(u.href)
    } catch {}
  }

  for (const m of text.match(/https?:\/\/[^\s,"'<>]+/g) || []) push(m)

  // Bare domains: split on lines + commas (CSV cells), keep dot-containing
  // single tokens that aren't emails and don't collide with the explicit pass.
  for (const cell of text.split(/[\n,;\t]+/)) {
    const t = cell.trim().replace(/^["']|["']$/g, '')
    if (!t || t.includes(' ') || t.includes('@') || t.includes('://')) continue
    if (!/^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/.test(t)) continue
    push(`https://${t}`)
  }

  return found.slice(0, MAX_LINKS)
}

type Phase = 'input' | 'running' | 'done'

export default function ImportClient({ username }: { username: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>('input')
  const [progress, setProgress] = useState({ done: 0, saved: 0, skipped: 0, failed: 0 })
  const [current, setCurrent] = useState('')
  const cancelled = useRef(false)

  const urls = extractUrls(text)

  // Same logged-in header action as the profile page.
  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const readFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => setText(String(reader.result || ''))
    reader.readAsText(file)
  }

  const run = async () => {
    cancelled.current = false
    setPhase('running')
    const batch = urls
    let saved = 0, skipped = 0, failed = 0
    for (let i = 0; i < batch.length; i++) {
      if (cancelled.current) break
      setCurrent(batch[i])
      try {
        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: batch[i] }),
        })
        const body = await res.json().catch(() => ({}))
        if (res.ok && body.saved) saved++
        else if (res.ok && body.skipped) skipped++
        else failed++
      } catch {
        failed++
      }
      setProgress({ done: i + 1, saved, skipped, failed })
      // The throttle. Skip the pointless trailing wait on the last row.
      if (i < batch.length - 1 && !cancelled.current) {
        await new Promise((r) => setTimeout(r, GAP_MS))
      }
    }
    setPhase('done')
  }

  const pct = urls.length ? Math.round((progress.done / urls.length) * 100) : 0

  return (
    <main className="min-h-screen bg-paper">
      <BulletinHeader
        action={{ label: 'Log out', onClick: handleSignOut }}
        logoClassName="h-[26px] sm:h-[34px]"
      />
      <div className="mx-auto max-w-2xl px-6 pb-20 pt-8 sm:px-8">
        <Link
          href={`/${username}`}
          className="label mb-6 inline-block text-black/35 transition-colors hover:text-ink"
        >
          ← back
        </Link>
        <h1 className="mb-2 font-serif text-3xl font-bold tracking-tight text-ink">
          Import links
        </h1>
        <p className="mb-8 text-[15px] leading-relaxed text-black/60">
          Bringing links from somewhere else? Paste them below — or drop in a
          CSV export from Pocket, Raindrop, or a spreadsheet. We only read the
          URLs; titles and images get fetched fresh for each one.
        </p>

        {phase === 'input' && (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'https://example.com/article\nhttps://another.com/post\n…or paste a whole CSV, we’ll find the links'}
              rows={9}
              className="w-full resize-y rounded-xl border border-black/10 bg-white p-4 font-mono text-[13px] leading-relaxed text-ink placeholder:text-black/30 focus:border-black/25 focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="label cursor-pointer text-black/45 transition-colors hover:text-ink">
                <input
                  type="file"
                  accept=".csv,.txt,.tsv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
                />
                or upload a .csv
              </label>
              <span className="label text-black/35">
                {urls.length === MAX_LINKS
                  ? `first ${MAX_LINKS} links`
                  : `${urls.length} link${urls.length === 1 ? '' : 's'} found`}
              </span>
            </div>
            <button
              onClick={run}
              disabled={urls.length === 0}
              className="mt-6 rounded-full bg-ink px-7 py-3 text-sm text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Import {urls.length > 0 ? urls.length : ''} link{urls.length === 1 ? '' : 's'}
            </button>
            {urls.length > 40 && (
              <p className="mt-3 text-[13px] text-black/40">
                Imports run one link at a time (≈{Math.ceil((urls.length * GAP_MS) / 60000)}{' '}
                min for this batch) — keep this tab open.
              </p>
            )}
          </>
        )}

        {phase !== 'input' && (
          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]">
              <div
                className="h-full rounded-full bg-ink transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="label text-black/45">
                {phase === 'running' ? `${progress.done} of ${urls.length}` : 'done'}
              </span>
              <span className="label text-black/35">
                {progress.saved} saved
                {progress.skipped > 0 && ` · ${progress.skipped} already there`}
                {progress.failed > 0 && ` · ${progress.failed} failed`}
              </span>
            </div>
            {phase === 'running' && (
              <>
                <p className="mt-3 truncate font-mono text-[12px] text-black/35">{current}</p>
                <button
                  onClick={() => { cancelled.current = true }}
                  className="label mt-6 text-black/45 transition-colors hover:text-ink"
                >
                  stop here
                </button>
              </>
            )}
            {phase === 'done' && (
              <div className="mt-8">
                <p className="mb-6 text-[15px] text-black/60">
                  {progress.saved > 0
                    ? 'Saved. Titles and screenshots keep filling in over the next few minutes.'
                    : progress.failed > 0
                      ? 'Those links didn’t go through — check they load in a browser, then try again.'
                      : 'Nothing new to add — those links were already on your bulletin.'}
                </p>
                <Link
                  href={`/${username}`}
                  className="rounded-full bg-ink px-7 py-3 text-sm text-white transition-opacity hover:opacity-85"
                >
                  See your bulletin
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
