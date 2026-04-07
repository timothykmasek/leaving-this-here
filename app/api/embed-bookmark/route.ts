import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { embed, bookmarkToEmbedText } from '@/lib/embed'

// POST /api/embed-bookmark
// Body: { id: string }
// Embeds a single bookmark by id and writes `embedding` back to the row.
// RLS ensures a user can only embed their own bookmarks.
export async function POST(req: Request) {
  try {
    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ error: 'missing id' }, { status: 400 })
    }

    const supabase = await createSupabaseServer()

    // Fetch the bookmark — RLS will scope this to the current user
    const { data: bookmark, error: fetchErr } = await supabase
      .from('bookmarks')
      .select('id, title, description, url, tags, user_id')
      .eq('id', id)
      .single()

    if (fetchErr || !bookmark) {
      return NextResponse.json({ error: 'bookmark not found' }, { status: 404 })
    }

    const text = bookmarkToEmbedText(bookmark)
    if (!text.trim()) {
      return NextResponse.json({ ok: true, skipped: 'empty text' })
    }

    const [vector] = await embed([text], 'document')

    const { error: updateErr } = await supabase
      .from('bookmarks')
      .update({ embedding: vector as any })
      .eq('id', id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'unknown error' }, { status: 500 })
  }
}
