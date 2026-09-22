import { NextRequest, NextResponse } from 'next/server'

// The iOS app's sign-in doorway. ASWebAuthenticationSession names the host of
// the FIRST url it opens in its "wants to use … to sign in" prompt, so the
// app opens this route on our domain and we bounce to Supabase's hosted
// OAuth flow. Nothing else changes: Supabase still redirects back to the
// app's bulletin:// callback with the tokens in the fragment.
//
// The two params are allow-listed, not forwarded, so this can't be turned
// into an open redirect.

export const dynamic = 'force-dynamic'

const PROVIDERS = new Set(['google'])
const REDIRECTS = new Set(['bulletin://auth-callback'])

export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const provider = q.get('provider') ?? 'google'
  const redirectTo = q.get('redirect_to') ?? 'bulletin://auth-callback'
  if (!PROVIDERS.has(provider) || !REDIRECTS.has(redirectTo)) {
    return NextResponse.json({ error: 'Unknown provider or redirect' }, { status: 400 })
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return NextResponse.json({ error: 'Auth not configured' }, { status: 500 })

  const authorize = new URL('/auth/v1/authorize', base)
  authorize.searchParams.set('provider', provider)
  authorize.searchParams.set('redirect_to', redirectTo)
  return NextResponse.redirect(authorize, { status: 302 })
}
