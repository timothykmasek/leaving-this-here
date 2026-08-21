// Reading a place off a Maps screenshot.
//
// A Maps place page is bot-gated for datacenter fetches, so nothing about the
// place survives a server-side fetch — but the extension's capture, taken in the
// user's own browser, shows all of it. This module reads that capture.
//
// Two calls, deliberately separate, because the model is good at one and bad at
// the other:
//   extractPlaceFacts() — name/kind/price/rating/reviews/address. Accurate.
//   extractPhotoEdges() — where the hero photo is. Asking for a BOUNDING BOX
//                         returned a box containing the floating search bar and
//                         ~100px of map; asking for four EDGES landed every
//                         value within ~9px on a 1466px capture. Same model,
//                         same image — the framing is what fixed it.
//
// Self-contained (no '@/' imports) so backfill scripts can load it directly.

const MODEL = 'claude-haiku-4-5'

export interface PlaceFacts {
  name: string | null
  kind: string | null
  price: string | null
  rating: string | null
  reviews: string | null
  address: string | null
}

export interface PhotoEdges {
  panelLeft: number
  panelRight: number
  photoTop: number
  photoBottom: number
}

const FACTS_PROMPT = `This image is a screenshot of a map service's place page (Google Maps or Apple Maps).
Extract ONLY what is plainly legible. Do not infer or guess; use null when unsure.

Reply with ONLY compact JSON, no prose:
{"name":string|null,"kind":string|null,"price":string|null,"rating":string|null,"reviews":string|null,"address":string|null}

- kind: the venue category exactly as shown (e.g. "Restaurant", "Cafe", "Museum").
- price: the price band as shown (e.g. "€100+", "$$"), else null.
- rating / reviews: digits only, e.g. "4.3" and "133".
- Deliberately NOT extracted: opening hours and open/closed state. They are
  perishable, and this result gets stored.`

const EDGES_PROMPT = `A screenshot of a map service's place page. It has a narrow icon rail on the far
left, then a vertical INFO PANEL, then the map fills the rest. The panel's top is
a photo, usually with a rounded search box floating on top of that photo.

Give four numbers as FRACTIONS (0-1) of the image dimensions:
- panelLeft: x where the info panel starts (right edge of the icon rail)
- panelRight: x where the info panel ends and the MAP begins
- photoTop: y of the first row that is BELOW the floating search box
- photoBottom: y where the photo ends and the white text area begins

If the page shows no photo of the place, reply {"noPhoto":true}.
Otherwise reply ONLY compact JSON:
{"panelLeft":n,"panelRight":n,"photoTop":n,"photoBottom":n}`

async function askHaiku(
  apiKey: string,
  jpegBase64: string,
  prompt: string,
  maxTokens: number,
): Promise<any | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    })
    if (!res.ok) return null
    const body: any = await res.json()
    const m = (body?.content?.[0]?.text || '').match(/\{[\s\S]*\}/)
    return m ? JSON.parse(m[0]) : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function extractPlaceFacts(
  apiKey: string,
  jpegBase64: string,
): Promise<PlaceFacts | null> {
  const j = await askHaiku(apiKey, jpegBase64, FACTS_PROMPT, 300)
  if (!j || typeof j !== 'object') return null
  const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const facts: PlaceFacts = {
    name: str(j.name), kind: str(j.kind), price: str(j.price),
    rating: str(j.rating), reviews: str(j.reviews), address: str(j.address),
  }
  // All-null means the capture wasn't a place page at all.
  return Object.values(facts).some(Boolean) ? facts : null
}

export async function extractPhotoEdges(
  apiKey: string,
  jpegBase64: string,
): Promise<PhotoEdges | null> {
  const j = await askHaiku(apiKey, jpegBase64, EDGES_PROMPT, 200)
  if (!j || j.noPhoto) return null
  const n = (v: any) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : null)
  const e = {
    panelLeft: n(j.panelLeft), panelRight: n(j.panelRight),
    photoTop: n(j.photoTop), photoBottom: n(j.photoBottom),
  }
  if (Object.values(e).some((v) => v === null)) return null
  const out = e as PhotoEdges
  // Degenerate or inverted boxes mean the model lost the plot — better no photo
  // than a sliver of chrome.
  if (out.panelRight - out.panelLeft < 0.08) return null
  if (out.photoBottom - out.photoTop < 0.06) return null
  return out
}

// Every observed error pushed an edge OUTWARD — into the map, into the search
// bar. Losing a few px of photo is invisible; keeping a few px of Google chrome
// is the whole thing we're trying to remove. So bias inward.
const INSET_X = 0.012
const INSET_Y = 0.020

/** Edges + image size → an integer pixel crop box [left, top, right, bottom]. */
export function cropBoxFromEdges(
  e: PhotoEdges,
  width: number,
  height: number,
): [number, number, number, number] {
  const left = Math.round((e.panelLeft + 0.005) * width)
  const top = Math.round((e.photoTop + INSET_Y) * height)
  const right = Math.round((e.panelRight - INSET_X) * width)
  const bottom = Math.round((e.photoBottom - INSET_X) * height)
  return [left, top, right, bottom]
}
