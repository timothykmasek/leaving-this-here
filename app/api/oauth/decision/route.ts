import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'

// POST /api/oauth/decision — the consent form's target. Approve/deny the
// authorization through Supabase's OAuth server and bounce the user back to
// the client via the redirect it hands us. Cookie-authed: the decision must
// come from the signed-in Bulletin session that saw the consent screen.

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const authorizationId = String(form.get('authorization_id') || '')
  const decision = String(form.get('decision') || '')

  if (!authorizationId || !['approve', 'deny'].includes(decision)) {
    return NextResponse.redirect(new URL('/oauth/consent', request.url), 303)
  }

  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(
      new URL(
        `/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`,
        request.url,
      ),
      303,
    )
  }

  const { data, error } =
    decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId)

  // Which params ride the return trip — diagnostic for the client-side
  // "state: Field required" class of failure (vercel logs; never the values).
  if (data?.redirect_url) {
    try {
      const u = new URL(data.redirect_url)
      console.log(
        `[oauth/decision] ${decision} → ${u.origin}${u.pathname} params: ${[...u.searchParams.keys()].join(',') || 'NONE'}`,
      )
    } catch {}
  }

  if (error || !data?.redirect_url) {
    // Expired/duplicate authorization — land back on the consent page, which
    // renders the explanatory error state for a dead authorization_id.
    return NextResponse.redirect(
      new URL(`/oauth/consent?authorization_id=${authorizationId}`, request.url),
      303,
    )
  }

  return NextResponse.redirect(data.redirect_url, 303)
}
