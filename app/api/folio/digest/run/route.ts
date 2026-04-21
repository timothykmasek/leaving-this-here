import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'
import { renderDigestHTML, renderDigestText } from '@/lib/digest-email'

// GET /api/folio/digest/run
//
// Invoked on a Vercel Cron schedule (see vercel.json). For every subscriber
// whose condition is met (≥10 new links OR ≥30 days since anchor, and ≥1
// link to ship), we fetch the new bookmarks, render the digest, send via
// Resend, and stamp last_digest_at.
//
// Protected by a CRON_SECRET bearer header. Vercel Cron automatically sends
// `Authorization: Bearer <CRON_SECRET>` when the env var is set.

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — digests are batched sequentially

export async function GET(req: Request) {
  // Auth — allow either Vercel Cron (Bearer token) or a one-off manual trigger
  // via ?secret= (useful for debugging). If CRON_SECRET isn't set, refuse.
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization') || ''
  const url = new URL(req.url)
  const querySecret = url.searchParams.get('secret') || ''
  if (auth !== `Bearer ${expected}` && querySecret !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = await createSupabaseServer()

  const { data: due, error: dueErr } = await supabase.rpc('folio_digests_due', {
    p_min_links: 10,
    p_min_days: 30,
  })
  if (dueErr) {
    if (/folio_digests_due|folio_subscribers/i.test(dueErr.message || '')) {
      return NextResponse.json({ ok: true, eligible: 0, sent: 0, warning: 'migration_pending' })
    }
    console.error('[digest/run] RPC error', dueErr)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN || url.origin
  const rows = due || []
  let sent = 0
  const errors: string[] = []

  for (const row of rows) {
    // Fetch new bookmarks for this owner since the anchor.
    const { data: links } = await supabase
      .from('bookmarks')
      .select('url, title, description, image_url, screenshot_url, favicon_url, note, created_at')
      .eq('user_id', row.owner_id)
      .eq('is_private', false)
      .gt('created_at', row.anchor_at)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!links || links.length === 0) continue

    const ownerName = row.owner_display_name || row.owner_username
    const ownerUrl = `${origin}/${row.owner_username}`
    const unsubscribeUrl = `${origin}/folio/unsubscribe?token=${encodeURIComponent(row.subscriber_unsubscribe_token)}`

    const digestArgs = { ownerName, ownerUsername: row.owner_username, ownerUrl, links: links as any, unsubscribeUrl }

    const result = await sendEmail({
      to: row.subscriber_email,
      subject: `${ownerName}'s folio — ${links.length} new link${links.length === 1 ? '' : 's'}`,
      html: renderDigestHTML(digestArgs),
      text: renderDigestText(digestArgs),
    })

    if (result.delivered) {
      await supabase.rpc('folio_digest_mark_sent', { p_subscriber_id: row.subscriber_id })
      sent++
    } else if (result.error) {
      errors.push(`${row.subscriber_email}: ${result.error}`)
    }
  }

  return NextResponse.json({ ok: true, eligible: rows.length, sent, errors: errors.slice(0, 10) })
}
