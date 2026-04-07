import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { embed } from '@/lib/embed'

// POST /api/search
// Body: { query: string, user_id: string }
// Returns semantically ranked bookmarks for a given user's profile.
// Private bookmarks are only included when the caller is the owner.
export async function POST(req: Request) {
  try {
    const { query, user_id } = await req.json()
    if (!query || !user_id) {
      return NextResponse.json({ error: 'missing query or user_id' }, { status: 400 })
    }

    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    const isOwner = user?.id === user_id

    // Embed the query using the `query` input type for better recall
    let queryVector: number[]
    try {
      const [v] = await embed([query], 'query')
      queryVector = v
    } catch (err: any) {
      return NextResponse.json({ error: `embed failed: ${err.message}` }, { status: 500 })
    }

    const { data, error } = await supabase.rpc('match_bookmarks', {
      query_embedding: queryVector as any,
      target_user_id: user_id,
      include_private: isOwner,
      match_threshold: 0.3,
      match_count: 50,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ bookmarks: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'unknown error' }, { status: 500 })
  }
}
