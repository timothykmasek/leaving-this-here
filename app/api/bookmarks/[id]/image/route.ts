import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'
import { SCREENSHOT_BUCKET } from '@/lib/screenshot'

// POST   /api/bookmarks/[id]/image  — set this bullet's own picture
// DELETE /api/bookmarks/[id]/image  — go back to the automatic one
//
// The card's picture is normally chosen for it: og:image or screenshot, ordered
// by lib/cardImage. This is the override for when both are wrong — a Maps link
// whose capture is Google's bot wall, a shop whose og is a bare wordmark.
//
// Stored at raw_metadata.customImage rather than in a new column, and rather
// than overwriting image_url. Two reasons: the original stays recoverable, so
// "use the automatic one again" is a real action instead of a re-fetch; and
// raw_metadata.place and .product already work exactly this way, selected as a
// narrow JSON path so the grid never hauls the whole blob.
//
// Same split as the list-cover route: the cookie client proves who is asking
// and writes the row (bookmarks RLS enforces ownership), while the service key
// does ONLY the storage upload — the card-images bucket is public-read but
// written server-side, and granting authenticated insert would widen write
// access to every card image in the app.
//
// Bytes arrive already downscaled and webp-encoded by the browser
// (lib/imageResize). Images serve direct from Supabase with no optimizer, so
// whatever lands here is what every visitor downloads.

export const dynamic = 'force-dynamic'

const MAX_BYTES = 2_000_000
const MIN_BYTES = 1_000

async function ownedBookmark(supabase: any, id: string, userId: string) {
  const { data } = await supabase
    .from('bookmarks')
    .select('id, raw_metadata')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  return data
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const bookmark = await ownedBookmark(supabase, params.id, user.id)
  if (!bookmark) return NextResponse.json({ error: 'bullet not found' }, { status: 404 })

  if (!(req.headers.get('content-type') || '').startsWith('image/')) {
    return NextResponse.json({ error: 'expected an image body' }, { status: 400 })
  }
  const bytes = new Uint8Array(await req.arrayBuffer())
  if (bytes.byteLength < MIN_BYTES || bytes.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `image must be between ${MIN_BYTES}B and ${MAX_BYTES}B (got ${bytes.byteLength}B)` },
      { status: 400 }
    )
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 500 })
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // Its own namespace: `<id>.<ext>` at the bucket root belongs to screenshots
  // and `og/` to persisted card images, so a custom picture must not collide.
  const path = `custom/${params.id}.webp`
  const { error: upErr } = await admin.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, bytes, {
      contentType: 'image/webp',
      upsert: true,
      cacheControl: '31536000, immutable',
    })
  if (upErr) return NextResponse.json({ error: `upload failed: ${upErr.message}` }, { status: 502 })

  const { data: pub } = admin.storage.from(SCREENSHOT_BUCKET).getPublicUrl(path)
  // Cache-bust on the row, not the object: the path is stable (upsert), so
  // without this a replaced picture would keep serving the immutable old bytes.
  const url = `${pub.publicUrl}?v=${Date.now()}`

  const { error: dbErr } = await supabase
    .from('bookmarks')
    .update({ raw_metadata: { ...(bookmark.raw_metadata || {}), customImage: url } })
    .eq('id', params.id)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ url })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const bookmark = await ownedBookmark(supabase, params.id, user.id)
  if (!bookmark) return NextResponse.json({ error: 'bullet not found' }, { status: 404 })

  // Only the row changes. The stored object is left alone: re-uploading
  // overwrites the same path anyway, and deleting bytes is the one step here
  // that can't be undone.
  const next = { ...(bookmark.raw_metadata || {}) }
  delete (next as any).customImage

  const { error } = await supabase
    .from('bookmarks')
    .update({ raw_metadata: next })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
