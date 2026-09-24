import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createBookmarkFromUrl } from '@/lib/createBookmark'
import { importsRemaining } from '@/lib/importQuota'
import { checkSaveLimit, logLimitHit } from '@/lib/saveLimits'

// POST /api/import — save one URL for the signed-in user, via the same shared
// pipeline as every other save path (metadata → insert → async embed +
// screenshot).
//
// Deliberately single-URL: the /import page drives the batch client-side, one
// request at a time with a delay between each, so a 500-row CSV can't slam
// the metadata fetcher / ScreenshotOne / Voyage all at once and each call
// stays comfortably inside the serverless timeout.
//
// Also the single-link "Add Bullet" door. `bulk: true` marks a row from a bulk
// import run: it's stored as source 'import' and counts toward the free import
// allowance (lib/importQuota). A single add is source 'web' and never counts.
// The client pre-checks the whole batch against /api/import/check before it
// starts (an import that doesn't fit is blocked whole); the per-link check here
// is the backstop.
//
// Body: { url: string, bulk?: boolean }
// Returns { saved: true, id } | { skipped: true } (duplicate or dead link)
//       | 403 { limitReached: true, remaining: 0 }   (import allowance used up)
//       | 429 { limitReached: true, error }          (Add Bullet daily limit)
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  }

  let url: unknown
  let bulk = false
  try {
    const body = await request.json()
    url = body?.url
    bulk = body?.bulk === true
  } catch {
    return NextResponse.json({ error: 'bad body' }, { status: 400 })
  }
  if (typeof url !== 'string' || url.length > 2048) {
    return NextResponse.json({ error: 'bad url' }, { status: 400 })
  }
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
  } catch {
    return NextResponse.json({ error: 'bad url' }, { status: 400 })
  }

  if (bulk && (await importsRemaining(supabase, user.id)) <= 0) {
    await logLimitHit(user.id, 'import', 'import_allowance')
    return NextResponse.json({ limitReached: true, remaining: 0 }, { status: 403 })
  }
  if (!bulk) {
    const hit = await checkSaveLimit(supabase, user, 'web')
    if (hit) {
      return NextResponse.json({ limitReached: true, limit: hit.limit, error: hit.message }, { status: 429 })
    }
  }

  // createBookmarkFromUrl never throws. It returns the row id on success, a
  // duplicate skip, or a real error — kept distinct so the client stops
  // reporting genuine failures as "already there".
  const result = await createBookmarkFromUrl(supabase, user.id, url, {
    origin: request.nextUrl.origin,
    source: bulk ? 'import' : 'web',
  })
  if ('id' in result) return NextResponse.json({ saved: true, id: result.id })
  if ('skipped' in result) return NextResponse.json({ skipped: true })
  return NextResponse.json({ failed: true, error: result.error }, { status: 502 })
}
