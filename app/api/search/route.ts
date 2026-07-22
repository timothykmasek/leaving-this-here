import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { embed } from '@/lib/embed'

// Longest query we'll embed. Search queries are short by nature; anything
// beyond this is either an accident (pasted document) or someone burning our
// Voyage quota. Truncating (vs rejecting) keeps pasted-text searches working.
const MAX_QUERY_CHARS = 500

// POST /api/search
// Body: { query: string, user_id: string }
// Returns semantically ranked bookmarks for a given user's profile.
// Private bookmarks are only included when the caller is the owner.
// Requires a signed-in caller: every embed costs Voyage quota, and the only
// UI that calls this (the owner search pill) is behind auth anyway.
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const user_id = body?.user_id
    const query =
      typeof body?.query === 'string' ? body.query.trim().slice(0, MAX_QUERY_CHARS) : ''
    if (!query || !user_id) {
      return NextResponse.json({ error: 'missing query or user_id' }, { status: 400 })
    }

    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const isOwner = user.id === user_id

    // Embed the query using the `query` input type for better recall
    let queryVector: number[]
    try {
      const [v] = await embed([query], 'query')
      queryVector = v
    } catch (err: any) {
      return NextResponse.json({ error: `embed failed: ${err.message}` }, { status: 500 })
    }

    // pgvector RPC params: serialize as string literal for consistency with
    // how we store embeddings (raw JS arrays can silently fail).
    const queryVectorLiteral = `[${queryVector.join(',')}]`

    const { data, error } = await supabase.rpc('match_bookmarks', {
      query_embedding: queryVectorLiteral as any,
      target_user_id: user_id,
      include_private: isOwner,
      match_threshold: 0.4,
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
