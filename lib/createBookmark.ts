import type { createSupabaseServer } from '@/lib/supabase/server'
import { extractMetadata } from '@/lib/metadata'
import { embed, bookmarkToEmbedText } from '@/lib/embed'

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServer>>

function titlecaseDomain(url: string): string {
  try {
    return new URL(url)
      .hostname.replace(/^www\./, '')
      .split('.')[0]
      .replace(/[-_.]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim()
  } catch {
    return url
  }
}

/**
 * Create a fully-formed bookmark from a URL, the same way every other save
 * path does it: fetch metadata synchronously (so the card has a title/image
 * immediately), insert the row, optionally attach it to a list, then enrich
 * out-of-band — embedding + screenshot are fire-and-forget so a slow capture
 * never blocks the caller.
 *
 * Returns the new bookmark id, or null if the insert failed (e.g. the user
 * already saved this URL — (user_id, url) is unique). A bad link must never
 * throw out of here; callers seeding multiple URLs rely on that.
 */
export async function createBookmarkFromUrl(
  supabase: SupabaseServer,
  userId: string,
  url: string,
  opts: { origin: string; listId?: string | null } = { origin: '' }
): Promise<{ id: string } | null> {
  try {
    const meta = await extractMetadata(url)
    // Blocked/empty fetches happen (Cloudflare etc.) — fall back to a
    // titlecased domain root, never the raw URL.
    const title = meta.title || titlecaseDomain(url)

    const { data: inserted } = await supabase
      .from('bookmarks')
      .insert({
        user_id: userId,
        url,
        title,
        description: meta.description,
        image_url: meta.image,
        favicon_url: meta.favicon,
        raw_metadata: meta.raw,
      })
      .select('id')
      .single()
    if (!inserted) return null

    if (opts.listId) {
      await supabase
        .from('list_bookmarks')
        .insert({ list_id: opts.listId, bookmark_id: inserted.id })
    }

    // Out-of-band enrichment, identical to the other save paths.
    const embedText = bookmarkToEmbedText({ title, description: meta.description, url })
    if (embedText.trim()) {
      void (async () => {
        try {
          const [vector] = await embed([embedText], 'document')
          await supabase
            .from('bookmarks')
            .update({ embedding: `[${vector.join(',')}]` as any })
            .eq('id', inserted.id)
        } catch {}
      })()
    }
    if (opts.origin) {
      void fetch(`${opts.origin}/api/persist-screenshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inserted.id }),
      }).catch(() => {})
    }

    return { id: inserted.id }
  } catch {
    return null
  }
}
