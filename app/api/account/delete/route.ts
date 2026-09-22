import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'
import { SCREENSHOT_BUCKET } from '@/lib/screenshot'

// Delete the signed-in account: everything they published, everything they
// saved, then the login itself. App Store rule 5.1.1(v) — an app with
// sign-in must let people delete their account from inside the product.
//
// Rows go in dependency order with the service role, so this doesn't lean on
// whichever cascades the live schema happens to have. Storage is best-effort:
// a stranded card image is harmless, a stranded row is not.
//
// The caller re-types their username; the server checks it, so a stray
// POST can't wipe an account.

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Two doors, same check: the web sends its cookie session; the iOS app
  // sends a bearer token like every /api/extension/* call.
  const authHeader = req.headers.get('authorization') || ''
  const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  const supabase = await createSupabaseServer()
  let user = null as null | { id: string; email?: string }
  if (bearer) {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data } = await anon.auth.getUser(bearer)
    user = data.user
  } else {
    const { data } = await supabase.auth.getUser()
    user = data.user
  }
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const confirm = String(body?.confirm || '').trim().toLowerCase()

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Deletion not configured' }, { status: 500 })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false },
  })

  const { data: profile } = await admin
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle()
  // No profile yet (abandoned onboarding): the login alone is the account,
  // and there's no username to type back — the email stands in.
  const expected = (profile?.username || user.email || '').toLowerCase()
  if (!expected || confirm !== expected) {
    return NextResponse.json({ error: 'Confirmation didn’t match' }, { status: 400 })
  }

  const uid = user.id

  // Storage first, while the bookmark and list ids still exist to name paths.
  try {
    const [{ data: bullets }, { data: lists }] = await Promise.all([
      admin.from('bookmarks').select('id').eq('user_id', uid),
      admin.from('lists').select('id').eq('user_id', uid),
    ])
    const paths: string[] = []
    for (const b of bullets ?? []) {
      for (const ext of ['jpg', 'png', 'webp']) {
        paths.push(`${b.id}.${ext}`, `og/${b.id}.${ext}`)
      }
    }
    for (const l of lists ?? []) {
      for (const ext of ['jpg', 'png', 'webp']) paths.push(`covers/${l.id}.${ext}`)
    }
    for (let i = 0; i < paths.length; i += 200) {
      await admin.storage.from(SCREENSHOT_BUCKET).remove(paths.slice(i, i + 200))
    }
  } catch {
    // Best-effort; carry on to the rows.
  }

  // Leaves first, then the trunk. Each is idempotent if a cascade beat us.
  const steps: Array<() => PromiseLike<{ error: { message: string } | null }>> = [
    () => admin.from('shelf_dismissals').delete().eq('user_id', uid),
    () => admin.from('activation_tokens').delete().eq('user_id', uid),
    () => admin.from('follows').delete().or(`follower_id.eq.${uid},following_id.eq.${uid}`),
    () => admin.from('lists').delete().eq('user_id', uid), // list_bookmarks cascades
    () => admin.from('bookmarks').delete().eq('user_id', uid),
    () => admin.from('profiles').delete().eq('id', uid),
  ]
  for (const step of steps) {
    const { error } = await step()
    // A table that doesn't exist on this deploy is not a failure.
    if (error && !/relation .* does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const { error: authError } = await admin.auth.admin.deleteUser(uid)
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

  // Drop the browser's session cookies; the user behind them is gone. (The
  // bearer path has no cookies; the app clears its own Keychain copy.)
  if (!bearer) await supabase.auth.signOut().catch(() => {})
  return NextResponse.json({ ok: true })
}
