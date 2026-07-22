import { waitUntil } from '@vercel/functions'
import type { createSupabaseServer } from '@/lib/supabase/server'
import { extractMetadata } from '@/lib/metadata'
import { classifyCardType } from '@/lib/cardType'
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
 *
 * `opts.title` / `opts.screenshotUrl` let a caller with better data than a live
 * fetch (the onboarding seed library: curated titles, pre-baked screenshots)
 * override what the fetch returns — shop sites hand a datacenter fetcher junk
 * like "Your cart" titles and blocked og:images. A provided screenshot also
 * skips the capture call: it IS a production capture, just done at bake time.
 */
export async function createBookmarkFromUrl(
  supabase: SupabaseServer,
  userId: string,
  url: string,
  opts: {
    origin: string
    listId?: string | null
    title?: string | null
    screenshotUrl?: string | null
  } = { origin: '' }
): Promise<{ id: string } | null> {
  try {
    const meta = await extractMetadata(url)
    // Blocked/empty fetches happen (Cloudflare etc.) — fall back to a
    // titlecased domain root, never the raw URL.
    const title = opts.title || meta.title || titlecaseDomain(url)

    const { data: inserted } = await supabase
      .from('bookmarks')
      .insert({
        user_id: userId,
        url,
        title,
        description: meta.description,
        image_url: meta.image,
        favicon_url: meta.favicon,
        screenshot_url: opts.screenshotUrl || null,
        card_type: classifyCardType(url, meta),
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
    if (opts.origin && !opts.screenshotUrl) {
      // waitUntil keeps the serverless instance alive until this request is
      // actually sent — a bare fire-and-forget can be dropped when the function
      // freezes right after responding, leaving screenshot_url null forever and
      // the card stuck on the og:image.
      waitUntil(
        fetch(`${opts.origin}/api/persist-screenshots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: inserted.id }),
        }).catch(() => {}),
      )
    }

    return { id: inserted.id }
  } catch {
    return null
  }
}
