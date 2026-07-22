import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { embed } from '@/lib/embed'

// GET /api/lists/[id]/suggestions
//
// Powers the "ambient shelf" on a list page: OTHER links the owner already
// saved that fit this list, ranked, so a thin list can grow from the library
// without searching. Owner-only — this reads the owner's whole library
// (including private, unfiled links), so we never expose it to visitors.
//
// Ranking signal = the list's THEME as a single vector:
//   centroid(embeddings of bullets already in the list)
//   blended with embedding(list name + description)   [weight `nameWeight`]
// then nearest-neighbour over the owner's other embedded bookmarks, excluding
// anything already filed here. The centroid+blend math lives here (flexible
// weighting; JS vector ops) — the DB does the heavy indexed NN scan via
// match_bookmarks_for_list.
//
// Query params (all optional, for tuning/testing):
//   ?threshold=0.55   cosine floor — below this we'd rather show nothing
//   ?limit=6          max cards on the shelf
//   ?nameWeight=0.3   how much the list name pulls vs. the existing bullets
//                     (0 = centroid only; helps thin/cold-start lists)

export const dynamic = 'force-dynamic'

type Vec = number[]

function parseVec(e: unknown): Vec | null {
  if (Array.isArray(e)) return e as Vec
  if (typeof e === 'string') {
    try {
      const v = JSON.parse(e)
      return Array.isArray(v) ? v : null
    } catch {
      return null
    }
  }
  return null
}

function normalize(v: Vec): Vec {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}

function dot(a: Vec, b: Vec): number {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

// Cosine similarity. `target` is already unit-norm, but divide by |b| so raw
// candidate embeddings compare fairly. Mismatched/empty vectors → 0 (skipped).
function cosine(a: Vec, b: Vec): number {
  if (!a.length || !b.length) return 0
  let nb = 0
  for (const x of b) nb += x * x
  nb = Math.sqrt(nb)
  if (nb === 0) return 0
  return dot(a, b) / nb / (Math.sqrt(dot(a, a)) || 1)
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n))

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const listId = params.id
    const url = new URL(req.url)
    const threshold = clamp(Number(url.searchParams.get('threshold')) || 0.55, 0, 1)
    const limit = clamp(Math.trunc(Number(url.searchParams.get('limit')) || 6), 1, 24)
    // Default 0: rank on the list's existing bullets only, no per-load Voyage
    // call for the name embedding — noticeably faster, and for a list with a few
    // bullets the results are ~identical. Pass ?nameWeight=0.3 to re-enable the
    // name blend (helps thin/empty lists cold-start, at the cost of a round-trip).
    const nameWeight = clamp(
      url.searchParams.get('nameWeight') !== null
        ? Number(url.searchParams.get('nameWeight'))
        : 0,
      0,
      1
    )

    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
    }

    // List (for the ownership check) and member embeddings don't depend on each
    // other — fetch both concurrently. Sequentially these were the second-biggest
    // slice of shelf latency after the pool pull.
    const [listRes, membersRes] = await Promise.all([
      supabase
        .from('lists')
        .select('id, name, description, user_id')
        .eq('id', listId)
        .single(),
      supabase
        .from('list_bookmarks')
        .select('bookmarks(id, embedding)')
        .eq('list_id', listId),
    ])

    // Owner-only: suggestions read the owner's private/unfiled library.
    const { data: list, error: listErr } = listRes
    if (listErr || !list) {
      return NextResponse.json({ error: 'list not found' }, { status: 404 })
    }
    if (list.user_id !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    // Embeddings of the bullets already in the list → centroid.
    const { data: members, error: memErr } = membersRes
    if (memErr) {
      return NextResponse.json({ error: memErr.message }, { status: 500 })
    }

    const memberIds = new Set(
      (members || []).map((m: any) => m.bookmarks?.id).filter(Boolean) as string[]
    )
    const memberVecs: Vec[] = (members || [])
      .map((m: any) => parseVec(m.bookmarks?.embedding))
      .filter((v: Vec | null): v is Vec => !!v && v.length > 0)

    // Name/description embedding — the blend lever that steadies thin lists.
    let nameVec: Vec | null = null
    if (nameWeight > 0) {
      const themeText = [list.name, list.description].filter(Boolean).join('. ').trim()
      if (themeText) {
        try {
          const [v] = await embed([themeText], 'query')
          nameVec = v
        } catch {
          // Non-fatal: fall back to centroid-only rather than failing the shelf.
          nameVec = null
        }
      }
    }

    if (memberVecs.length === 0 && !nameVec) {
      // Nothing to reason from (empty list, no embeddings, no usable name).
      return NextResponse.json({ suggestions: [], reason: 'no_signal' })
    }

    // Build the target vector. Normalize each source before mixing so the blend
    // weight is meaningful (raw centroid magnitude shrinks as bullets cancel).
    const dim = (memberVecs[0] || nameVec)!.length
    let target = new Array(dim).fill(0)

    if (memberVecs.length) {
      const centroid = new Array(dim).fill(0)
      for (const v of memberVecs) for (let i = 0; i < dim; i++) centroid[i] += v[i]
      const cN = normalize(centroid) // mean direction; /len folds into normalize
      // If we have no name vector, the bullets carry all the weight.
      const w = nameVec ? 1 - nameWeight : 1
      for (let i = 0; i < dim; i++) target[i] += w * cN[i]
    }
    if (nameVec) {
      const nN = normalize(nameVec)
      // If there are no member vectors, the name carries all the weight.
      const w = memberVecs.length ? nameWeight : 1
      for (let i = 0; i < dim; i++) target[i] += w * nN[i]
    }
    target = normalize(target)

    // Fast path: if the optional match_bookmarks_for_list function exists in
    // Supabase (migrations/012_list_suggestions_optional.sql), let Postgres do
    // the ranking — an indexed pgvector scan returning ~`limit` rows (~10KB)
    // instead of pulling the whole library's vectors (~7MB at 1k bookmarks).
    // Detected per-request; any error falls through to the JS path below, so
    // the SQL is a paste-once speed upgrade, never a deploy dependency.
    {
      const literal = `[${target.join(',')}]` // pgvector wants a string literal
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        'match_bookmarks_for_list',
        {
          query_embedding: literal as any,
          target_user_id: user.id,
          exclude_list_id: listId,
          include_private: true,
          match_threshold: threshold,
          match_count: limit,
        }
      )
      if (!rpcErr && Array.isArray(rpcData)) {
        return NextResponse.json({
          suggestions: rpcData,
          meta: {
            seed_count: memberVecs.length,
            used_name: !!nameVec,
            name_weight: nameVec ? nameWeight : 0,
            threshold,
            engine: 'rpc',
          },
        })
      }
    }

    // Fallback: rank in JS over the owner's OTHER embedded bookmarks. Works with
    // zero DB objects, so the feature never depends on a migration. Fine at
    // current scale (hundreds–low thousands of vectors), just heavier per load.
    // Paginate — PostgREST caps at 1000/req.
    const CARD_COLS =
      'id, url, title, description, image_url, screenshot_url, favicon_url, card_type, is_private, embedding'
    let pool: any[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('bookmarks')
        .select(CARD_COLS)
        .eq('user_id', user.id)
        .not('embedding', 'is', null)
        .range(from, from + 999)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      pool = pool.concat(data || [])
      if (!data || data.length < 1000) break
    }

    const suggestions = pool
      .filter((b) => !memberIds.has(b.id)) // never re-suggest what's already filed
      .map((b) => ({ b, similarity: cosine(target, parseVec(b.embedding) || []) }))
      .filter((x) => x.similarity > threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(({ b, similarity }) => {
        const { embedding, ...card } = b // don't ship the raw vector to the client
        return { ...card, similarity }
      })

    return NextResponse.json({
      suggestions,
      meta: {
        seed_count: memberVecs.length,
        used_name: !!nameVec,
        name_weight: nameVec ? nameWeight : 0,
        threshold,
        engine: 'js',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'unknown error' }, { status: 500 })
  }
}
