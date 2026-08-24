import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServer } from '@/lib/supabase/server'
import { SCREENSHOT_BUCKET } from '@/lib/screenshot'

// POST   /api/lists/[id]/cover   — store a cover image, return its public URL
// DELETE /api/lists/[id]/cover   — clear the cover ("no cover" is a real choice)
//
// Two clients, deliberately:
//   • the cookie-authed client proves who is asking and writes the `lists` row,
//     where RLS ("owner manages lists") is what actually enforces ownership;
//   • the service-role client does ONLY the storage upload, because the
//     `card-images` bucket is public-read but written server-side — there's no
//     storage policy granting authenticated users insert, and adding one would
//     widen write access to every card image in the app.
// The ownership check below is therefore belt-and-braces over RLS, but it's what
// stops a non-owner from writing bytes into covers/<someone-else's-list>.
//
// Bytes arrive already downscaled and webp-encoded by the browser (see
// lib/imageResize.ts). Serving images direct from Supabase with no optimizer in
// front means whatever lands here is what every visitor downloads, so the size
// ceiling is enforced rather than advisory.

export const dynamic = 'force-dynamic'

const MAX_COVER_BYTES = 2_000_000
// Below this and the "image" is a decode failure or a blank canvas, not a photo.
const MIN_COVER_BYTES = 1_000

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { data: list } = await supabase
    .from('lists')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!list) return NextResponse.json({ error: 'list not found' }, { status: 404 })

  const contentType = req.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) {
    return NextResponse.json({ error: 'expected an image body' }, { status: 400 })
  }

  const bytes = new Uint8Array(await req.arrayBuffer())
  if (bytes.byteLength < MIN_COVER_BYTES || bytes.byteLength > MAX_COVER_BYTES) {
    return NextResponse.json(
      { error: `cover must be between ${MIN_COVER_BYTES}B and ${MAX_COVER_BYTES}B (got ${bytes.byteLength}B)` },
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

  const path = `covers/${params.id}.webp`
  const { error: upErr } = await admin.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, bytes, {
      contentType: 'image/webp',
      upsert: true,
      cacheControl: '31536000, immutable',
    })
  if (upErr) {
    return NextResponse.json({ error: `upload failed: ${upErr.message}` }, { status: 502 })
  }

  const { data: pub } = admin.storage.from(SCREENSHOT_BUCKET).getPublicUrl(path)
  // Cache-bust on the row, not the object: the path is stable (upsert), so
  // without this a replaced cover would keep serving the immutable old bytes.
  const url = `${pub.publicUrl}?v=${Date.now()}`

  const { error: dbErr } = await supabase
    .from('lists')
    .update({ cover_image_url: url })
    .eq('id', params.id)
  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ url })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  // Only the row is cleared. The stored object is left alone: it costs almost
  // nothing, re-adding a cover overwrites the same path anyway, and deleting
  // bytes is the one step here that can't be undone.
  const { error } = await supabase
    .from('lists')
    .update({ cover_image_url: null })
    .eq('id', params.id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
