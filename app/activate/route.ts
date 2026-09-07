import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createHash } from 'crypto'

// Durable activation: /activate?token=<raw>. The token is ours (migration 025),
// single-use but non-expiring, so a claimed user can sign in whenever they
// want — Supabase's 1h magic-link window never reaches them because we mint AND
// consume a fresh session inside this one request.
//
// Flow: hash the raw token → look it up (service role) → if unused, admin
// generateLink for that user's email → verifyOtp through a cookie-writing
// server client (session lands in cookies, visible to SSR) → mark the token
// used → land them on their profile.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const raw = searchParams.get('token') || ''
  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${reason}`)

  if (!raw) return fail('activate_missing')
  const tokenHash = createHash('sha256').update(raw).digest('hex')

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: row } = await admin
    .from('activation_tokens')
    .select('user_id, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (!row) return fail('activate_invalid')
  if (row.used_at) return fail('activate_used')

  // The user's email (to mint a fresh OTP for) and their username (to land on).
  const { data: authUser } = await admin.auth.admin.getUserById(row.user_id)
  const email = authUser?.user?.email
  if (!email) return fail('activate_invalid')
  const { data: profile } = await admin
    .from('profiles')
    .select('username')
    .eq('id', row.user_id)
    .maybeSingle()

  const { data: link, error: le } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHashOtp = link?.properties?.hashed_token
  if (le || !tokenHashOtp) return fail('activate_failed')

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete(name)
        },
      },
    }
  )
  const { error: ve } = await supabase.auth.verifyOtp({
    type: (link!.properties!.verification_type as any) || 'magiclink',
    token_hash: tokenHashOtp,
  })
  if (ve) {
    console.error('[activate] verifyOtp failed:', ve.message)
    return fail('activate_failed')
  }

  // Consume the durable token only after the session is established.
  await admin
    .from('activation_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)

  return NextResponse.redirect(`${origin}/${profile?.username ?? ''}`)
}
