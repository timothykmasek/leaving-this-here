import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/cron/check-links
//
// The link-rot sweeper. Asks a slice of the library whether it is still there,
// records what it found, and never decides anything on one answer.
//
// ── CADENCE ────────────────────────────────────────────────────────────────
//
// A healthy link is re-checked quarterly. Rot is slow; checking a working link
// more often buys nothing and costs politeness. A FAILING link is re-checked in
// three days instead, so a genuine 404 is confirmed within the week rather than
// sitting unproven for another quarter — the fast path exists precisely so the
// two-strike rule doesn't make the feature useless.
//
// ── WHAT IT COSTS ──────────────────────────────────────────────────────────
//
// Tim's 1,115 links at a 90-day cadence is ~13 checks a day. This route's
// default batch of 200 covers that many times over, so the backlog is always
// empty and most runs do almost nothing.
//
// At 10,000 users × 1,000 links it is ~111,000 a day, which one daily run of
// 200 does NOT cover. That is the point at which this route stops being the
// right shape and wants a queue — the batch is bounded on purpose so the
// failure mode is "the backlog drains slowly", never "the function times out".
//
// ── WHY IT IS CAREFUL ──────────────────────────────────────────────────────
//
// Measured on 150 of Tim's own links: 4 were genuinely gone, and 6 more were
// refused because the request came from a datacenter rather than a browser.
// A naive checker would have reported ten dead links, more than half of them
// alive — and invited someone to delete things they had deliberately saved.
// So 401/403/429 are recorded as 'blocked' and never count toward death.
//
// Triggered by Vercel Cron (see vercel.json), which sends
// `Authorization: Bearer <CRON_SECRET>`. Service-role work across every user,
// so it MUST stay behind that secret.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEFAULT_BATCH = 200
const CONCURRENCY = 10
const HEALTHY_DAYS = 90
const FAILING_DAYS = 3
const TIMEOUT_MS = 10_000
// Stop STARTING new probes after this. maxDuration is 60s, and the batch alone
// does not bound the run: 200 links at a 10s timeout and concurrency 10 is 200
// seconds in the worst case, which would be killed mid-flight. Measured on a
// real batch of 196 the whole run took 23s — but that was a lucky batch, and
// the failure mode of guessing wrong here is a function that dies without
// recording anything it learned. Whatever is left simply stays due.
const DEADLINE_MS = 45_000

// A real browser's UA. Not a disguise — plenty of servers simply refuse an
// unknown agent, and being refused would be recorded as a fact about the link
// when it is only a fact about the request.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Bulletin-LinkCheck/1.0 (+https://www.yourbulletin.com)'

type Status = 'ok' | 'gone' | 'blocked' | 'error'

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

async function probe(url: string): Promise<Status> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': UA },
    })
    // Plenty of servers refuse HEAD outright. A refusal of the METHOD says
    // nothing about the page, so ask again properly, for as little as possible.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': UA, Range: 'bytes=0-1024' },
      })
    }
    const s = res.status
    if (s >= 200 && s < 400) return 'ok'
    if (s === 404 || s === 410) return 'gone'
    if (s === 401 || s === 403 || s === 429) return 'blocked'
    return 'error'
  } catch (err: any) {
    // A domain that no longer resolves is the one network failure that really
    // does mean gone. Everything else — refused, reset, TLS, timeout — is a
    // fact about this attempt, not about the link.
    const code = String(err?.cause?.code || err?.name || err)
    if (/ENOTFOUND|EAI_AGAIN/.test(code)) return 'gone'
    return 'error'
  } finally {
    clearTimeout(timer)
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  if ((req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const batch = Math.min(Number(url.searchParams.get('limit')) || DEFAULT_BATCH, 500)
  // Reports what it WOULD do and writes nothing. The first run against a real
  // library should always be a dry one.
  const dryRun = url.searchParams.get('dry') === '1'

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const now = Date.now()
  const healthyCutoff = new Date(now - HEALTHY_DAYS * 864e5).toISOString()
  const failingCutoff = new Date(now - FAILING_DAYS * 864e5).toISOString()

  // Never checked, or a healthy link that is due, or a failing one that is due
  // sooner. Ordered least-recently-checked first so the sweep is fair and
  // resumable — a run that dies just gets picked up by the next one.
  const { data: due, error } = await sb
    .from('bookmarks')
    .select('id, url, link_status, link_fail_count')
    .or(
      `link_checked_at.is.null,` +
        `and(link_status.eq.ok,link_checked_at.lt.${healthyCutoff}),` +
        `and(link_status.neq.ok,link_checked_at.lt.${failingCutoff})`
    )
    .order('link_checked_at', { ascending: true, nullsFirst: true })
    .limit(batch)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // One link per host per run. The cheapest possible politeness: a library with
  // 40 links on one domain spreads them over 40 runs instead of hammering it in
  // one burst. Deferred rows stay due and lead the next run.
  const seen = new Set<string>()
  const rows = (due || []).filter((b) => {
    const h = hostOf(b.url)
    if (!h || seen.has(h)) return false
    seen.add(h)
    return true
  })

  const tally: Record<Status, number> = { ok: 0, gone: 0, blocked: 0, error: 0 }
  const newlyDead: string[] = []
  const checkedAt = new Date().toISOString()

  // Fixed-size worker pool rather than Promise.all over everything: bounded
  // sockets, and the slowest link can't stall the rest.
  const startedAt = Date.now()
  let cursor = 0
  let ranOutOfTime = false
  async function worker() {
    while (cursor < rows.length) {
      if (Date.now() - startedAt > DEADLINE_MS) {
        ranOutOfTime = true
        return
      }
      const b = rows[cursor++]
      const status = await probe(b.url)
      tally[status]++

      const fails = status === 'ok' ? 0 : (b.link_fail_count || 0) + 1
      if (status === 'gone' && fails >= 2) newlyDead.push(b.url)

      if (!dryRun) {
        await sb
          .from('bookmarks')
          .update({ link_checked_at: checkedAt, link_status: status, link_fail_count: fails })
          .eq('id', b.id)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker))

  return NextResponse.json({
    dryRun,
    due: due?.length ?? 0,
    // What was actually probed. Not the same as the batch when the deadline cut
    // the run short — every worker checks the clock before taking its next
    // item, so cursor is exactly the number that got a verdict.
    checked: cursor,
    ranOutOfTime,
    elapsedMs: Date.now() - startedAt,
    candidates: rows.length,
    deferredSameHost: (due?.length ?? 0) - rows.length,
    ...tally,
    // Confirmed twice — the only ones a reader would ever be shown.
    newlyDead: newlyDead.slice(0, 20),
    newlyDeadCount: newlyDead.length,
  })
}
