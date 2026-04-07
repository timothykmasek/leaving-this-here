import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { embed, bookmarkToEmbedText } from '@/lib/embed'

// POST /api/backfill-embeddings
// Body: { batchSize?: number, maxBatches?: number }
//
// Backfills embeddings for all the current user's bookmarks that are missing
// one. Scoped to the current user by RLS — this is not a global admin job.
// Voyage accepts up to 128 inputs per call, but we cap at 32 to keep payloads
// small and errors easier to diagnose.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = Math.min(Math.max(body.batchSize || 16, 1), 32)
    const maxBatches = Math.min(Math.max(body.maxBatches || 50, 1), 200)

    const supabase = await createSupabaseServer()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
    }

    let processed = 0
    let errors = 0
    let batches = 0
    let firstError: string | null = null

    while (batches < maxBatches) {
      const { data: rows, error } = await supabase
        .from('bookmarks')
        .select('id, title, description, url, tags')
        .eq('user_id', user.id)
        .is('embedding', null)
        .limit(batchSize)

      if (error) {
        return NextResponse.json({ error: error.message, processed, errors }, { status: 500 })
      }

      if (!rows || rows.length === 0) break

      const texts = rows.map((r) => bookmarkToEmbedText(r))
      // Filter out rows whose embed text is empty — nothing to vectorize
      const indexedTexts = texts
        .map((t, i) => ({ t, i }))
        .filter(({ t }) => t.trim().length > 0)

      if (indexedTexts.length === 0) {
        // All empty — mark them as processed by moving on; they'd otherwise
        // loop forever. We set a 1-dim-ish sentinel? no — skip updating, and
        // break to avoid an infinite loop.
        break
      }

      let vectors: number[][]
      try {
        vectors = await embed(
          indexedTexts.map((x) => x.t),
          'document'
        )
      } catch (err: any) {
        return NextResponse.json(
          { error: `embed failed: ${err.message}`, processed, errors },
          { status: 500 }
        )
      }

      // Write each vector back. Supabase client doesn't do efficient bulk
      // upsert of vector columns, so we do one update per row. N is small.
      //
      // IMPORTANT: pgvector expects the string literal format `[0.1, 0.2, ...]`
      // when going through PostgREST. Passing a raw JS array can silently fail
      // depending on the supabase-js version, so we serialize explicitly.
      for (let k = 0; k < indexedTexts.length; k++) {
        const rowIdx = indexedTexts[k].i
        const bookmarkId = rows[rowIdx].id
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
      if (rows.length < batchSize) break
    }

    return NextResponse.json({ ok: true, processed, errors, batches, firstError })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'unknown error' }, { status: 500 })
  }
}
