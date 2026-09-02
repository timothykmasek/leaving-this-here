import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/waitlist  { email }
//
// Beta-landing email capture. Always answers { ok: true } on a well-formed
// request — a duplicate signup, a table that doesn't exist yet, even a failed
// insert. The landing page shows its thank-you optimistically and offers no
// error state (per the design: button → form → confirmation, one forward
// path), so an honest 500 here could only strand the visitor on a dead form.
// The one thing that gets a 400 is a request we couldn't even read an email
// out of.

export const dynamic = 'force-dynamic'

// Deliberately loose — the native <input type="email"> already gated the
// format client-side; this just keeps garbage and essays out of the table.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  let email = ''
  try {
    const body = await req.json()
    email = String(body?.email ?? '').trim().toLowerCase()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // Duplicate emails hit the unique index and error — that's the idempotency,
  // not a failure. Anything else (missing table, outage) is logged and
  // swallowed for the same reason as above.
  const { error } = await admin.from('waitlist').insert({ email, source: 'landing' })
  if (error && error.code !== '23505') {
    console.error('[waitlist] insert failed:', error.message)
  }

  // Doorbell: email Tim on each genuinely new signup (duplicates stay silent).
  // Awaited (a serverless runtime may not finish a dangling promise after the
  // response) but never fatal.
  if (!error && process.env.RESEND_API_KEY) {
    try {
      const { count } = await admin
        .from('waitlist')
        .select('*', { count: 'exact', head: true })
      const nth = count ? ` — #${count} on the list` : ''
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Bulletin <bulletin@yourbulletin.com>',
          to: 'timothykmasek@gmail.com',
          subject: `Beta request: ${email}`,
          text: `${email} just asked for beta access${nth}.`,
        }),
      })
      if (!res.ok) {
        console.error('[waitlist] notify failed:', res.status, await res.text())
      }
    } catch (e) {
      console.error('[waitlist] notify failed:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
