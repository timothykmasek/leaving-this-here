import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { embed, bookmarkToEmbedText } from '@/lib/embed'

// GET /api/cron/backfill-embeddings
//
// Global safety net for embeddings. The extension save path now fires the
// Voyage embed fire-and-forget so the toast returns fast; if a serverless
// instance is frozen before that finishes, the row is left with embedding =
// null. This job sweeps ALL users' bookmarks missing an embedding and fills
// them in. Unlike /api/backfill-embeddings (cookie + RLS, current user only),
// this runs with the service-role key and is not user-scoped — so it MUST stay
// behind the cron secret.
//
// Triggered by Vercel Cron (see vercel.json). Vercel sends GET with header
// `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set.
// Set CRON_SECRET in the Vercel project env, or this endpoint returns 401.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const BATCH = 32
  const MAX_BATCHES = 8 // bound per-run work so we stay well under maxDuration

  let processed = 0
  let errors = 0
  let batches = 0
  let firstError: string | null = null

  while (batches < MAX_BATCHES) {
    const { data: rows, error } = await supabase
      .from('bookmarks')
      .select('id, title, description, url, tags')
      .is('embedding', null)
      .limit(BATCH)

    if (error) {
      return NextResponse.json({ error: error.message, processed, errors }, { status: 500 })
    }
    if (!rows || rows.length === 0) break

    // Skip rows with no embeddable text so they don't loop forever.
    const indexed = rows
      .map((r, i) => ({ text: bookmarkToEmbedText(r), i }))
      .filter((x) => x.text.trim().length > 0)
    if (indexed.length === 0) break

    let vectors: number[][]
    try {
      vectors = await embed(indexed.map((x) => x.text), 'document')
    } catch (err: any) {
      return NextResponse.json(
        { error: `embed failed: ${err.message}`, processed, errors },
        { status: 500 }
      )
    }

    for (let k = 0; k < indexed.length; k++) {
      const bookmarkId = rows[indexed[k].i].id
      // pgvector wants the string-literal format `[0.1, 0.2, ...]` via PostgREST.
      const vectorLiteral = `[${vectors[k].join(',')}]`
      const { error: updErr } = await supabase
        .from('bookmarks')
        .update({ embedding: vectorLiteral as any })
        .eq('id', bookmarkId)
      if (updErr) {
        errors++
        if (!firstError) firstError = updErr.message || 'unknown update error'
      } else {
        processed++
      }
    }

    batches++
    if (rows.length < BATCH) break
  }

  return NextResponse.json({ ok: true, processed, errors, batches, firstError })
}
