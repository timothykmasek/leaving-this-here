import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { embed } from '@/lib/embed'

// Longest query we'll embed. Search queries are short by nature; anything
// beyond this is either an accident (pasted document) or someone burning our
// Voyage quota. Truncating (vs rejecting) keeps pasted-text searches working.
const MAX_QUERY_CHARS = 500

// Similarity gating.
//
// This used to be a flat `match_threshold: 0.4`, which quietly broke one-word
// searches. voyage-3-lite similarity scales with how much meaning the query
// carries, so the useful range moves with query length — measured against the
// real 1106-bullet corpus:
//
//   "eco friendly wipes"  top 0.691   (3 words — 0.4 is about right)
//   "sustainable products" top 0.514  (2 words)
//   "wipes"                top 0.423  (1 word — barely clears)
//   "biom"                 top ~0.42, the matching bullet itself 0.376 — CUT,
//                          despite ranking 3rd out of 1106
//   "green"                nothing in the entire corpus reached 0.4
//
// So the fix isn't a lower constant (that floods 3-word queries with noise) —
// it's a cutoff relative to the best match for THIS query, which self-calibrates
// across query lengths. Keep anything within RELATIVE_CUTOFF of the top hit,
// never below ABSOLUTE_FLOOR (which just keeps genuine nonsense out).
const ABSOLUTE_FLOOR = 0.18
const RELATIVE_CUTOFF = 0.62
// Pull a wider candidate set than we return, so the relative cutoff has
// something to cut. Ranking happens in the RPC; this only trims the tail.
const CANDIDATE_COUNT = 120
// The cutoff decides relevance; this decides how much we show. They're separate
// because a one-word query has a FLAT similarity distribution — nothing stands
// out, so a relative cutoff legitimately admits a long tail ("biom" kept 50+).
// Tightening RELATIVE_CUTOFF instead would start dropping real hits on rich
// queries, where the distribution is peaked. 24 is six rows of the 4-up grid,
// and the client puts exact keyword hits ahead of these anyway.
const RESULT_COUNT = 24

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
      match_threshold: ABSOLUTE_FLOOR,
      match_count: CANDIDATE_COUNT,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (data || []) as { similarity: number }[]
    const top = rows[0]?.similarity ?? 0
    const cutoff = Math.max(ABSOLUTE_FLOOR, top * RELATIVE_CUTOFF)
    const bookmarks = rows.filter((r) => r.similarity >= cutoff).slice(0, RESULT_COUNT)

    return NextResponse.json({ bookmarks })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'unknown error' }, { status: 500 })
  }
}
