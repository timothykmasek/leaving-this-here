import { ImageResponse } from 'next/og'
import { createSupabaseServer } from '@/lib/supabase/server'
import { loadCardo, INK } from '@/lib/og'

// A list's own share card — the profile's list card, turned on its side.
//
// Without this file the profile's card cascades down, so sharing "The fit
// check" showed Tim Masek and a count of every bullet he owns: branded, but
// about the wrong thing.
//
// The identity of a list is its contents, which is why the card in the profile
// is a contact sheet of its members rather than a title on a plate. This is
// that band at landscape proportions, bleeding off both edges the same way.
//
// No wordmark, no owner, no count: a share card already sits under the site's
// name, the owner, and a description supplied by the meta tags, so repeating
// them inside the picture spends the picture on things the platform is
// printing anyway. The plate and the strip are what a Bulletin list looks
// like; that's the whole card.
//
// The list's own cover is deliberately NOT used here. Covers are written as
// webp by the picker (lib/imageResize), and Satori cannot decode webp — a
// cover card would have been blank for almost every list, while the strip is
// drawn from a pool big enough that something in it always renders.

export const runtime = 'edge'
export const alt = 'Bulletin'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Consider far more members than the strip draws: most of this library is
// webp, which Satori cannot decode, so a small pool comes up short. The AI
// list has 146 members and the first twelve held two usable images — enough to
// fall back when the list plainly had plenty deeper in.
//
// Widening the pool is nearly free because the first pass is on the URL, not
// the network: our own bucket names files from the content-type it stored, so
// the extension is trustworthy for everything the save path has persisted.
// Only the survivors are confirmed over the wire.
const STRIP_CANDIDATES = 60
const STRIP_CONFIRM = 8
const STRIP_TILES = 5
const STRIP_MIN = 3
const LIKELY_DRAWABLE = /\.(jpe?g|png|svg)$/i
// The plate, and the band's place on it, taken from CollectionCard: a #f1f1f1
// plate with the strip starting ~35% down and standing ~28% of the height. At
// 630 that is 220 and 174; the band is opened up a little here because a
// landscape card gives it room the portrait one doesn't.
const PLATE = '#f1f1f1'
const STRIP_H = 286
const STRIP_TOP = 172
// 45/295 of the plate on the card. Same share of this one, fading into the
// plate colour rather than to `transparent` — see LinkStrip.
const FADE_W = 184
const FADE_TO = 'rgba(241,241,241,0)'
// The band starts left of the frame and runs past the right, so it reads as a
// slice of something longer rather than a row that happens to fit.
const STRIP_BLEED = 72
// Uneven widths at one shared height, so the band has the ragged rhythm of a
// contact sheet rather than the tidy beat of a grid — the same reason the
// profile's card lets each thumb keep its own width.
//
// Relative, not fixed: the strip draws whatever survived the format check,
// which is 3, 4 or 5 tiles. Fixed widths summed short at 4 and left a quarter
// of the card empty, which reads as a broken image rather than a design.
// Normalising to the full bleed means the band always spans the frame.
const TILE_WEIGHTS = [1.15, 0.9, 1.35, 1.05, 1.2]

function tileWidths(n: number): number[] {
  const span = size.width + STRIP_BLEED * 2
  const used = TILE_WEIGHTS.slice(0, n)
  const total = used.reduce((a, b) => a + b, 0)
  return used.map((w) => Math.round((w / total) * span))
}

export default async function ListOgImage({
  params,
}: {
  params: { username: string; listSlug: string }
}) {
  const supabase = await createSupabaseServer()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .eq('username', params.username)
    .single()

  let name = params.listSlug
  let candidates: string[] = []

  if (profile?.id) {
    const { data: list } = await supabase
      .from('lists')
      .select('id, name')
      .eq('user_id', profile.id)
      .eq('slug', params.listSlug)
      .maybeSingle()

    if (list) {
      name = list.name || params.listSlug
      const { data: members } = await supabase
        .from('list_bookmarks')
        .select('bookmarks(image_url, screenshot_url)')
        .eq('list_id', list.id)
        // Newest first, and above all DETERMINISTIC: unordered, Postgres is
        // free to hand back a different set each time and the card would
        // quietly reshuffle between renders.
        .order('added_at', { ascending: false })
        .limit(STRIP_CANDIDATES)
      candidates = (members || [])
        .map((m: any) => m.bookmarks)
        .filter(Boolean)
        .map((b: any) => b.image_url || b.screenshot_url)
        .filter(Boolean)
    }
  }


  // Satori decodes png, jpeg and svg — NOT webp, which it fails on silently,
  // drawing nothing while the layout still holds the space open. Roughly half
  // this library is webp, so every candidate is checked by content-type first.
  // By extension would not do: these URLs carry a ?v= cache-buster, and an
  // extension is not a promise about the bytes.
  const SATORI_FORMATS = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml']
  const drawable = async (url: string) => {
    try {
      const head = await fetch(url, { method: 'HEAD' })
      const type = (head.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      return head.ok && SATORI_FORMATS.includes(type) ? url : null
    } catch {
      return null
    }
  }

  // Free pass first: drop anything whose URL already says it is a format
  // Satori won't read, so the network is only asked about plausible ones.
  const likely = candidates.filter((u) => LIKELY_DRAWABLE.test(u.split('?')[0])).slice(0, STRIP_CONFIRM)

  const [fonts, checked] = await Promise.all([loadCardo(), Promise.all(likely.map(drawable))])

  const strip = (checked.filter(Boolean) as string[]).slice(0, STRIP_TILES)
  // Two tiles is not a contact sheet, it's two pictures. Below the floor the
  // card is the bare plate and the name — a deliberate look, not a thin strip.
  const hasStrip = strip.length >= STRIP_MIN
  const widths = tileWidths(strip.length)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: PLATE,
          display: 'flex',
          position: 'relative',
          color: INK,
          fontFamily: 'Cardo, serif',
        }}
      >
        {hasStrip && (
          <>
            <div style={{ position: 'absolute', top: STRIP_TOP, left: -STRIP_BLEED, display: 'flex', height: STRIP_H }}>
              {strip.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" width={widths[i]} height={STRIP_H} style={{ objectFit: 'cover' }} />
              ))}
            </div>
            {/* Scoped to the band's own height, not the full plate: a
                full-height fade reaches the name and washes it out. */}
            <div
              style={{
                position: 'absolute',
                top: STRIP_TOP,
                left: 0,
                width: FADE_W,
                height: STRIP_H,
                backgroundImage: `linear-gradient(to right, ${PLATE}, ${FADE_TO})`,
              }}
            />
            {/* Placed by a computed `left`, not `right: 0`: Satori honoured the
                left fade and ignored the right one, so the band ended in a hard
                edge on that side only. */}
            <div
              style={{
                position: 'absolute',
                top: STRIP_TOP,
                left: size.width - FADE_W,
                width: FADE_W,
                height: STRIP_H,
                backgroundImage: `linear-gradient(to left, ${PLATE}, ${FADE_TO})`,
              }}
            />
          </>
        )}

        <div
          style={{
            position: 'absolute',
            left: 80,
            bottom: 76,
            display: 'flex',
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -1,
            maxWidth: 1040,
          }}
        >
          {name}
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? (fonts as any) : undefined }
  )
}
