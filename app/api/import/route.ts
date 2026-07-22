import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createBookmarkFromUrl } from '@/lib/createBookmark'

// POST /api/import — save one URL for the signed-in user, via the same shared
// pipeline as every other save path (metadata → insert → async embed +
// screenshot).
//
// Deliberately single-URL: the /import page drives the batch client-side, one
// request at a time with a delay between each, so a 500-row CSV can't slam
// the metadata fetcher / ScreenshotOne / Voyage all at once and each call
// stays comfortably inside the serverless timeout.
//
// Body: { url: string }
// Returns { saved: true, id } | { skipped: true } (duplicate or dead link).
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  }

  let url: unknown
  try {
    ;({ url } = await request.json())
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

  // createBookmarkFromUrl never throws; null means duplicate (unique
  // user_id+url) or an insert failure — either way the row isn't there twice,
  // so the client reports it as skipped and moves on.
  const result = await createBookmarkFromUrl(supabase, user.id, url, {
    origin: request.nextUrl.origin,
  })
  if (!result) return NextResponse.json({ skipped: true })
  return NextResponse.json({ saved: true, id: result.id })
}
