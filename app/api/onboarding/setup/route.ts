import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { uniqueSlug } from '@/lib/slug'
import { createBookmarkFromUrl } from '@/lib/createBookmark'
import { SEED_LIBRARY, CATEGORY, type SeedLink } from '@/lib/seedLibrary'

// POST /api/onboarding/setup — the build step of account-first onboarding.
//
// By the time we get here the account already exists (account is step 1), so
// this runs with a cookie session. It turns the wizard's collected fields into
// a real page — no AI:
//
//   1. re-check + claim the handle  → profiles row (display name, bio)
//   2. starter list, named for WHY  → lists row (templated from picks, frozen slug)
//   3. the 3 picked seed links      → real bookmarks via the shared pipeline
//
// Idempotent: if the user already has a profile we return it untouched, so a
// double-submit (or a returning user) can't duplicate anything.
//
// Body: { handle, displayName, bio, picks: string[] }  (picks = seed URLs)

const RESERVED = new Set([
  'api', 'auth', 'login', 'logout', 'signup', 'setup', 'start', 'save',
  'bookmarklet', 'privacy', 'terms', 'about', 'help', 'admin', 'settings',
  'profile', 'search', 'lists', 'list', 'extension', 'www', 'mail', 'blog',
  'static', 'assets', 'public', 'home', 'index', 'new', 'edit', 'me',
  'according', 'accordingto', 'official', 'bulletin', 'bulletins',
])

function titlecase(s: string): string {
  return s.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

const SEED_BY_URL = new Map(SEED_LIBRARY.map((s) => [s.url, s]))

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  // Idempotency: already has a page → done, nothing to build.
  const { data: existing } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  if (existing) return NextResponse.json({ ok: true, username: existing.username })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const handle = String(body.handle || '').trim().toLowerCase()
  if (!handle || handle.length > 30 || !/^[a-z0-9-]+$/.test(handle) || RESERVED.has(handle)) {
    return NextResponse.json({ error: 'invalid handle', reason: 'invalid' }, { status: 400 })
  }

  const displayName = String(body.displayName || '').trim().slice(0, 60) || titlecase(handle)
  const bio = String(body.bio || '').trim().slice(0, 140) || null

  // Only accept URLs that are actually in our seed library — the picks come
  // from a fixed grid, so anything else is bogus.
  const picks: SeedLink[] = Array.isArray(body.picks)
    ? (body.picks as unknown[])
        .map((u) => (typeof u === 'string' ? SEED_BY_URL.get(u) : undefined))
        .filter((s): s is SeedLink => !!s)
        .slice(0, 3)
    : []

  // ── Profile (the authoritative handle claim — unique index decides) ──
  const { error: profErr } = await supabase.from('profiles').insert({
    id: user.id,
    username: handle,
    display_name: displayName,
    bio,
  })
  if (profErr) {
    if ((profErr as any).code === '23505') {
      return NextResponse.json({ error: 'handle taken', reason: 'taken' }, { status: 409 })
    }
    return NextResponse.json({ error: profErr.message }, { status: 400 })
  }

  // Everything below is best-effort: the page exists; enrich what we can.

  // The shape we want to seed (per Tim): the last pick becomes a one-item
  // starter list; the other two land as standalone bullets. So the new page
  // shows two loose cards + one list — not everything dumped into one list.
  const listPick = picks.length ? picks[picks.length - 1] : null

  let listId: string | null = null
  if (listPick) {
    const listName = CATEGORY[listPick.type].listName
    const { data: list } = await supabase
      .from('lists')
      .insert({ user_id: user.id, name: listName, slug: uniqueSlug(listName, []) })
      .select('id')
      .single()
    listId = list?.id || null
  }

  // ── Seed bookmarks: only the last pick attaches to the list ─────────────
  const origin = new URL(request.url).origin
  for (const pick of picks) {
    const inList = pick === listPick
    await createBookmarkFromUrl(supabase, user.id, pick.url, {
      origin,
      listId: inList ? listId : null,
    })
  }

  return NextResponse.json({ ok: true, username: handle })
}
