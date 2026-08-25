import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'

// The dead-links drawer's data. Owner-only, both ways.
//
// GET  — the caller's own bullets that are confirmed gone and not already
//        answered for.
// POST — { id } marks one Kept, which suppresses it without pretending the
//        link works (see migration 022).
//
// Fetched on demand rather than with the profile: this is a drawer somebody
// opens occasionally, and the profile page is the one we spent real effort
// making fast. The COUNT rides along with the page (it is cheap and decides
// whether the line appears at all); the rows only load when the line is
// clicked.

export const dynamic = 'force-dynamic'

// Confirmed gone: two strikes on separate sweeps. One 404 is a blip.
const MIN_STRIKES = 2

export async function GET() {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('bookmarks')
    .select(
      'id, url, title, description, image_url, screenshot_url, favicon_url, card_type, image_pref, link_checked_at'
    )
    .eq('user_id', user.id)
    .eq('link_status', 'gone')
    .gte('link_fail_count', MIN_STRIKES)
    .is('link_kept_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bullets: data || [] })
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({ id: null }))
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // user_id in the filter as well as RLS: the policy is the guard, this is the
  // guard being obvious at the call site.
  const { error } = await supabase
    .from('bookmarks')
    .update({ link_kept_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
