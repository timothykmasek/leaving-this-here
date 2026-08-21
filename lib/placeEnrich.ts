// Enrich a PLACE bullet at save time, server-side.
//
// Mirrors maybeStoreImagePref (lib/cardImageJudge.ts): fire-and-forget, called
// once the client capture has landed, best-effort, and a no-op for anything
// that isn't a place. Runs on Vercel — the only outbound calls are fetch to
// Anthropic and to OpenStreetMap. No image processing: the photo is stored as a
// fractional BOX and the card clips it with CSS.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isPlaceUrl, parsePlaceUrl, geocodePlace } from '@/lib/placeLink'
import {
  extractPlaceFacts, extractPhotoEdges, imageSize, photoBoxFromEdges,
} from '@/lib/placeExtract'

/** Search keywords built from the place itself. The stored ones describe
 *  Maps-the-product ("directions, navigation, route planner") for every place,
 *  which is why a saved restaurant was unfindable by its own name. */
function placeKeywords(
  facts: { name: string | null; kind: string | null; address: string | null },
  resolved: { kind?: string | null; city?: string | null; country?: string | null; addressLine?: string | null } | null,
  urlName: string | null,
): string {
  const out: string[] = []
  const push = (v: unknown) => {
    if (!v) return
    const s = String(v).trim().toLowerCase()
    if (s && !out.includes(s)) out.push(s)
  }
  push(facts.name || urlName)
  push(facts.kind)
  push(resolved?.kind ? String(resolved.kind).replace(/_/g, ' ') : null)
  push(resolved?.city)
  push(resolved?.country)
  resolved?.addressLine?.split(',').forEach(push)
  facts.address?.split(',').forEach((p) => push(p.replace(/\d{4,}/g, '').trim()))
  push('place')
  return out.filter(Boolean).join(', ')
}

/**
 * If this bullet is a Maps link and hasn't been enriched, read the place off the
 * capture and store it. Idempotent; swallows every failure (the card then just
 * renders as it did before).
 *
 * `bytes`/`mime` are the capture already in hand at the call site, so this costs
 * no extra download.
 */
export async function maybeEnrichPlace(
  admin: SupabaseClient,
  bookmarkId: string,
  bytes: Uint8Array,
  mime: string,
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return
  // The vision API takes png/jpeg/gif/webp; the size reader handles png/jpeg. A
  // capture in anything else still gets facts, just no photo box.
  if (mime !== 'image/png' && mime !== 'image/jpeg') return

  try {
    const { data: row } = await admin
      .from('bookmarks')
      .select('url, raw_metadata')
      .eq('id', bookmarkId)
      .single()
    if (!row || !isPlaceUrl(row.url)) return
    if ((row.raw_metadata as any)?.place?.name) return // already enriched

    const b64 = Buffer.from(bytes).toString('base64')
    const [facts, edges] = await Promise.all([
      extractPlaceFacts(apiKey, b64),
      extractPhotoEdges(apiKey, b64),
    ])
    if (!facts) return

    const parsed = parsePlaceUrl(row.url)
    // Accuracy is far better when the URL carries @lat,lng; a name-only lookup
    // put a chain in the wrong city in testing. Failure here is tolerable — it
    // only costs the map fallback, not the card.
    let resolved = null
    try {
      const q = facts.name || parsed.name
      if (q) resolved = await geocodePlace(q, { lat: parsed.lat, lon: parsed.lon })
    } catch { /* geocode is optional */ }

    const size = imageSize(bytes)
    const photoBox = edges && size ? photoBoxFromEdges(edges, size.width, size.height) : null

    const place = {
      name: facts.name || parsed.name || resolved?.name || null,
      kind: facts.kind || (resolved?.kind ? String(resolved.kind).replace(/_/g, ' ') : null),
      price: facts.price,
      rating: facts.rating,
      reviews: facts.reviews,
      // The capture's address is authoritative; the geocoder's is the fallback
      // (on the one place tested it landed ~100m away, on the next street).
      address: facts.address || resolved?.addressLine || null,
      city: resolved?.city || null,
      lat: resolved?.lat ?? parsed.lat ?? null,
      lon: resolved?.lon ?? parsed.lon ?? null,
      photo: null as string | null, // set only by the backfill script, which cuts a real file
      photoBox,
      source: 'capture-vision',
    }

    await admin
      .from('bookmarks')
      .update({
        raw_metadata: { ...((row.raw_metadata as any) || {}), place },
        keywords: placeKeywords(facts, resolved, parsed.name),
      })
      .eq('id', bookmarkId)
  } catch {
    // best-effort — the bullet still saves, it just stays a plain card
  }
}
