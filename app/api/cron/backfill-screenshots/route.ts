import { NextResponse } from 'next/server'

// GET /api/cron/backfill-screenshots
//
// Global safety net for card screenshots. Every save path (extension, onboarding
// seeds) fires a single best-effort capture fire-and-forget; if that request is
// dropped (frozen serverless instance) or trips a transient screenshotone error,
// the row is left with screenshot_url = null and nothing retries it — so the
// card is stuck on its og:image, or the domain-name placeholder when it has no
// og:image either (exactly what a fresh onboarding page hit).
//
// This drains the same unfinished set /api/persist-screenshots serves, a few
// batches per run, until it's empty. Mirrors backfill-embeddings: service-role
// work fanned out across all users, so it MUST stay behind the cron secret.
//
// Triggered by Vercel Cron (see vercel.json). Vercel sends GET with header
// `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const origin = new URL(req.url).origin
  const BATCH = 12
  const MAX_BATCHES = 3 // bound per-run work so we stay well under maxDuration

  let persisted = 0
  let marked = 0
  let failed = 0
  let batches = 0
  let firstError: string | null = null

  for (; batches < MAX_BATCHES; batches++) {
    let res: Response
    try {
      res = await fetch(`${origin}/api/persist-screenshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: BATCH }),
      })
    } catch (err: any) {
      firstError = firstError || err.message
      break
    }
    if (!res.ok) {
      firstError = firstError || `persist-screenshots HTTP ${res.status}`
      break
    }

    const d = await res.json()
    persisted += d.persisted || 0
    marked += d.marked || 0
    failed += d.failed || 0

    if (!d.hasMore) break
    // Stop early if a batch made no forward progress and wasn't merely
    // rate-limited — the remainder is dead/unreachable and will just churn.
    const progress = (d.persisted || 0) + (d.marked || 0)
    if (progress === 0 && !(d.rateLimited || 0)) break
  }

  return NextResponse.json({ ok: true, persisted, marked, failed, batches, firstError })
}
