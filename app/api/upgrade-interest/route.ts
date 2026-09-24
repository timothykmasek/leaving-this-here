import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'

// POST /api/upgrade-interest — the "Upgrade to Pro" button.
//
// There's no Pro plan to sell yet. The button is a doorbell: it emails Tim who
// asked (and what they were trying to do) so he can reach out by hand. Same
// pattern as the waitlist doorbell. Always answers { ok: true } for a signed-in
// user — the button shows its thank-you either way.
//
// Body: { context?: string }  e.g. "import of 1,240 links, 120 left"
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  let context = ''
  try {
    const body = await request.json()
    context = String(body?.context ?? '').slice(0, 200)
  } catch {}

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle()
  const who = profile?.username ? `@${profile.username}` : user.email || user.id

  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Bulletin <bulletin@yourbulletin.com>',
          to: 'timothykmasek@gmail.com',
          subject: `${who} wants to upgrade to Pro`,
          text:
            `${who} (${user.email ?? 'no email'}) wants to upgrade to Pro.` +
            (context ? `\n\nThey hit the import limit: ${context}.` : ''),
        }),
      })
      if (!res.ok) console.error('[upgrade-interest] notify failed:', res.status, await res.text())
    } catch (e) {
      console.error('[upgrade-interest] notify failed:', e)
    }
  }

  return NextResponse.json({ ok: true })
}
