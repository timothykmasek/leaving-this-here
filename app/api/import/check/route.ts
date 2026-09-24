import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { normalizeUrl } from '@/lib/normalizeUrl'
import { importsRemaining } from '@/lib/importQuota'

// POST /api/import/check — does this import fit the free allowance?
//
// Called once, before a bulk run starts. Counts only the links that would
// actually be NEW (a url_key the user doesn't already have), so re-importing a
// file that's mostly already on their Bulletin isn't blocked for links that
// would be skipped anyway. An import that doesn't fit is blocked whole: the
// client runs nothing and shows `remaining` with the upgrade button.
//
// Body: { urls: string[] }
// Returns { fits: boolean, newCount: number, remaining: number }
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  let urls: unknown
  try {
    ;({ urls } = await request.json())
  } catch {
    return NextResponse.json({ error: 'bad body' }, { status: 400 })
  }
  if (!Array.isArray(urls) || urls.length > 20000) {
    return NextResponse.json({ error: 'bad urls' }, { status: 400 })
  }

  const keys = new Set<string>()
  for (const u of urls) {
    if (typeof u !== 'string' || u.length > 2048) continue
    try {
      keys.add(normalizeUrl(u))
    } catch {}
  }

  // Drop the ones already saved. Chunked so a big file stays inside URL limits.
  const all = [...keys]
  for (let i = 0; i < all.length; i += 200) {
    const { data } = await supabase
      .from('bookmarks')
      .select('url_key')
      .eq('user_id', user.id)
      .in('url_key', all.slice(i, i + 200))
    for (const row of data || []) keys.delete(row.url_key)
  }

  const remaining = await importsRemaining(supabase, user.id)
  return NextResponse.json({ fits: keys.size <= remaining, newCount: keys.size, remaining })
}
