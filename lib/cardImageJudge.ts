// The og-vs-screenshot decision for a CONTESTED bare link — a homepage
// (card_type='screenshot') that has BOTH a designed og AND a stored screenshot,
// so there's a real choice about which makes the better card. A cheap Haiku
// vision judge looks at both and picks — reproducing mymind's "show the site vs
// show the brand asset" call better than any deterministic rule (logo→og /
// publisher→screenshot were both tested against Tim's own labels and rejected).
// The result is stored in bookmarks.image_pref and honoured by
// cardImageCandidates (lib/cardImage). Runs once, at persist time, only for the
// one contested case. ~$0.003/card — the Haiku-tagging cost tier.
//
// The V2 prompt is LOCKED (84% agreement with Tim's own labels, with the safe
// failure mode of defaulting to the clean image). Don't retune casually — see
// project_card_image_judge (memory); tune via a labelled eval set, not by feel.

import type { SupabaseClient } from '@supabase/supabase-js'

const JUDGE_MODEL = 'claude-haiku-4-5'

const V2_PROMPT =
  'You curate a visual bookmarking wall of HOMEPAGES. Image 1 = the site OG ' +
  'share-image, Image 2 = a screenshot of the rendered page. Pick the image that ' +
  'makes the better CARD: the most visually STRIKING and CLEAN one — a strong hero ' +
  'photo, art-directed imagery, or a bold clean brand composition — whether that is ' +
  'the og OR the screenshot. Do NOT apply fixed rules about logos or publishers; ' +
  'judge the images. PENALIZE clutter: cookie/consent banners, popups or modals, ' +
  "'session expired', dense nav chrome, tiny unreadable text, or a broken/empty " +
  'image. Reply ONLY compact JSON: {"choice":"og"|"screenshot"}'

type ImagePart = {
  type: 'image'
  source: { type: 'base64'; media_type: string; data: string }
}

// Fetch an image URL and return it as an Anthropic base64 image block, or null if
// it can't be fetched or isn't a usable image. We fetch ourselves (browser UA) so
// a host that blocks Anthropic's fetcher doesn't sink the judge.
async function fetchImagePart(url: string): Promise<ImagePart | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    })
    clearTimeout(timeout)
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    if (!res.ok || !ct.startsWith('image/')) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    // Skip empty/blank placeholders and monsters; Anthropic caps request size anyway.
    if (bytes.byteLength < 300 || bytes.byteLength > 8_000_000) return null
    const media = /png/.test(ct)
      ? 'image/png'
      : /gif/.test(ct)
        ? 'image/gif'
        : /webp/.test(ct)
          ? 'image/webp'
          : 'image/jpeg'
    return { type: 'image', source: { type: 'base64', media_type: media, data: bytes.toString('base64') } }
  } catch {
    return null
  }
}

/**
 * Which image makes the better card — the og or the screenshot? Returns
 * 'og' | 'screenshot', or null on any failure (caller then keeps the default
 * card-type routing). Needs BOTH images to fetch — otherwise there's no choice.
 */
export async function judgeCardImage(
  ogUrl: string,
  screenshotUrl: string,
): Promise<'og' | 'screenshot' | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const [ogPart, ssPart] = await Promise.all([
    fetchImagePart(ogUrl),
    fetchImagePart(screenshotUrl),
  ])
  if (!ogPart || !ssPart) return null

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        max_tokens: 60,
        messages: [
          { role: 'user', content: [ogPart, ssPart, { type: 'text', text: V2_PROMPT }] },
        ],
      }),
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const body: any = await res.json()
    const text: string = body?.content?.[0]?.text || ''
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const choice = JSON.parse(m[0])?.choice
    return choice === 'og' || choice === 'screenshot' ? choice : null
  } catch {
    return null
  }
}

/**
 * For a bare-link card that now has BOTH an og and a stored screenshot and no
 * decision yet, run the judge once and persist the result to
 * bookmarks.image_pref. Best-effort and idempotent: a decided row is skipped, and
 * any failure leaves image_pref null (the card falls back to card-type routing).
 * Only fires for card_type='screenshot' — the one contested case. Never throws;
 * safe to call fire-and-forget from a save/persist path.
 */
export async function maybeStoreImagePref(
  admin: SupabaseClient,
  bookmarkId: string,
): Promise<void> {
  try {
    const { data: row } = await admin
      .from('bookmarks')
      .select('card_type, image_url, screenshot_url, image_pref')
      .eq('id', bookmarkId)
      .single()
    if (!row || row.image_pref || row.card_type !== 'screenshot') return
    const og = (row.image_url || '').trim()
    const ss = (row.screenshot_url || '').trim()
    if (!og || !ss) return
    const choice = await judgeCardImage(og, ss)
    if (!choice) return
    await admin.from('bookmarks').update({ image_pref: choice }).eq('id', bookmarkId)
  } catch {
    // Never let the judge break the save/persist path.
  }
}
