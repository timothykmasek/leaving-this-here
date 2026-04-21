import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/resend'

// POST /api/folio/subscribe
// Body: { username: string, email: string }
//
// Looks up the owner by username, calls the folio_subscribe RPC to create
// (or refresh) a pending subscription, and sends a double-opt-in email via
// Resend. Returns 200 even if the row was a no-op (already confirmed) so the
// client can show the same success state either way.

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const username: string = (body?.username || '').trim().toLowerCase()
  const email: string = (body?.email || '').trim().toLowerCase()

  if (!username || !email) {
    return NextResponse.json({ error: 'username and email required' }, { status: 400 })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'invalid email' }, { status: 400 })
  }

  const supabase = await createSupabaseServer()

  // Resolve the owner
  const { data: owner } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .eq('username', username)
    .single()

  if (!owner) {
    return NextResponse.json({ error: 'folio not found' }, { status: 404 })
  }

  // Create / refresh the pending subscription via RPC
  const { data: token, error: rpcErr } = await supabase.rpc('folio_subscribe', {
    p_owner_id: owner.id,
    p_email: email,
  })

  if (rpcErr) {
    // Graceful fallback if migration 006 hasn't been applied.
    if (/folio_subscribe|folio_subscribers/i.test(rpcErr.message || '')) {
      console.warn('[folio/subscribe] migration 006 not applied yet — returning soft success')
      return NextResponse.json({ ok: true, warning: 'migration_pending' })
    }
    console.error('[folio/subscribe] RPC failed', rpcErr)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  // token === null means already confirmed + active — nothing to email.
  if (!token) {
    return NextResponse.json({ ok: true, already: true })
  }

  // Build the confirmation URL. Prefer the canonical origin; fall back to
  // the request's origin for preview/dev.
  const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN || new URL(req.url).origin
  const confirmUrl = `${origin}/folio/confirm?token=${encodeURIComponent(token)}`
  const ownerName = owner.display_name || owner.username

  await sendEmail({
    to: email,
    subject: `Confirm your subscription to ${ownerName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
        <h1 style="font-weight: 300; font-size: 28px; letter-spacing: -0.02em; margin: 0 0 16px;">
          Confirm your subscription
        </h1>
        <p style="font-size: 15px; line-height: 1.6; color: #555; margin: 0 0 24px;">
          One click to start receiving <strong>${escapeHtml(ownerName)}</strong>'s folio digest — a handful of links every time they save 10 new things, or once a month, whichever comes first.
        </p>
        <p style="margin: 32px 0;">
          <a href="${confirmUrl}" style="display: inline-block; background: #111; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-size: 14px; font-weight: 600;">
            Confirm subscription
          </a>
        </p>
        <p style="font-size: 12px; color: #999; margin-top: 40px;">
          If you didn't request this, you can ignore this email — nothing happens until you click confirm.
        </p>
      </div>
    `,
    text: `Confirm your subscription to ${ownerName}'s folio:\n\n${confirmUrl}\n\nIf you didn't request this, ignore this email.`,
  })

  return NextResponse.json({ ok: true })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
