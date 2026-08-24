import { createSupabaseServer } from '@/lib/supabase/server'
import { pickCardImage } from '@/lib/cardImage'
import { BracketLabel } from '@/components/BulletinHeader'

// Scratchpad — the pin. Hover a card and a tack appears top-right; the card
// swings down from it.
//
// The physics, and why the numbers below are what they are:
//
// A rigid body pinned at ONE point is a pendulum. It rotates until its centre
// of mass hangs directly beneath the pin.
//
// The SIGN is the whole thing, and it's easy to get backwards — I did. Pin at
// the top-RIGHT: the centre of mass sits down-and-LEFT of the pin, so to get
// beneath it the mass must travel RIGHT, which is COUNTER-clockwise, i.e. a
// NEGATIVE CSS rotation. Rotating positive instead lifts the top-left corner,
// and the card reads as held up on its left — the opposite of what a right-hand
// pin does. Mirrored for a top-LEFT pin: mass is down-and-right, it swings
// left, positive rotation.
//
// Check it against a real sheet of paper and a thumbtack; it takes ten seconds
// and settles the argument.
//
// The true rest angle is atan(w/h) either way — 37° for a 3:4 card, 45° for a
// square one. Real gravity would drop these onto their corners.
//
// So: keep the character, damp the amplitude. What makes it read as hanging
// isn't the size of the angle, it's that
//   1. the pivot is the PIN, not the card's centre (transform-origin), and
//   2. the pin does NOT rotate — it's stuck in the board, the card turns on it,
//      which is why it lives outside the rotating element here, and
//   3. it overshoots and settles, because a pendulum doesn't ease to a stop.
//
// No translate anywhere. "The rest of the card drops down" IS the rotation: pin
// the top-right corner and everything left of it falls. Adding a translateY
// would be fudging a motion the geometry already gives for free.
//
// Not linked anywhere. Delete once a feel is chosen.

export const dynamic = 'force-dynamic'

const W = 280
// Pin centre, inset from the card's top-right. transform-origin matches it
// exactly — a pivot even a few px off the tack reads as a slide, not a swing.
const PIN_INSET = 22

type Row = { id: string; title: string; image: string }

async function getRows(): Promise<Row[]> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('bookmarks')
    .select('id, title, url, image_url, screenshot_url, card_type, image_pref')
    .not('image_url', 'is', null)
    .limit(60)

  const rows: Row[] = []
  for (const b of (data || []) as any[]) {
    const image = pickCardImage(b.url, b.image_url, b.screenshot_url, b.card_type, b.image_pref)
    // Our own bucket only: a remote og:image that 404s makes a poor test of a
    // motion, and several of them do (see /preview/price).
    if (!image || !image.includes('/card-images/')) continue
    rows.push({ id: b.id, title: b.title || '', image })
    if (rows.length === 3) break
  }
  return rows
}

function PinnedCard({
  row,
  angle,
  duration,
  easing,
  side,
}: {
  row: Row
  angle: number
  duration: number
  easing: string
  side: 'left' | 'right'
}) {
  return (
    // Per-card CSS variables, read by the single rule in PIN_CSS. Inline
    // <style> per card would leak: `.group:hover` matches every card on the
    // page, so the last block emitted would set the angle for all of them.
    <div
      className={`pin pin-${side} group relative`}
      style={{
        width: W,
        // Sign follows the pin: a right-hand pin swings the card counter-
        // clockwise, a left-hand pin clockwise. Same magnitude, mirrored.
        ['--pin-angle' as any]: `${side === 'right' ? -angle : angle}deg`,
        ['--pin-dur' as any]: `${duration}ms`,
        ['--pin-ease' as any]: easing,
        ['--pin-inset' as any]: `${PIN_INSET}px`,
      }}
    >
      <div className="pin-card overflow-hidden rounded-[20px] bg-card card-lift">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={row.image} alt="" className="block h-auto w-full" />
      </div>

      {/* The tack. Outside the rotating box on purpose — it's in the board, not
          on the card, so it must not turn with it. Goes in slightly ahead of the
          swing: pin first, then the card drops. */}
      <span aria-hidden className="pin-tack" />
    </div>
  )
}

const PIN_CSS = `
.pin-card {
  transform: rotate(0deg);
  /* The pivot IS the tack. A few px off and it reads as a slide, not a swing. */
  transform-origin: calc(100% - var(--pin-inset)) var(--pin-inset);
}
.pin-left .pin-card {
  transform-origin: var(--pin-inset) var(--pin-inset);
  transition: transform var(--pin-dur) var(--pin-ease);
}
.pin:hover .pin-card { transform: rotate(var(--pin-angle)); }

.pin-tack {
  position: absolute;
  right: calc(var(--pin-inset) - 5px);
  top: calc(var(--pin-inset) - 5px);
}
.pin-left .pin-tack {
  right: auto;
  left: calc(var(--pin-inset) - 5px);
  z-index: 3;
  height: 10px;
  width: 10px;
  border-radius: 9999px;
  background: var(--ink, #2b2b2b);
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  opacity: 0;
  transform: scale(0.4);
  transition: opacity 140ms ease-out, transform 140ms ease-out;
  pointer-events: none;
}
.pin:hover .pin-tack { opacity: 1; transform: scale(1); }

@media (prefers-reduced-motion: reduce) {
  .pin-card, .pin-tack { transition: none; }
  .pin:hover .pin-card { transform: none; }
}
`

function Variant({
  n,
  name,
  note,
  rows,
  angle,
  duration,
  easing,
  side,
}: {
  n: string
  name: string
  note: string
  rows: Row[]
  angle: number
  duration: number
  easing: string
  side: 'left' | 'right'
}) {
  return (
    <section className="mb-24">
      <BracketLabel className="text-black/30">{n}</BracketLabel>
      <h2 className="mt-3 font-sans text-[20px] font-[600] leading-6 text-ink">{name}</h2>
      <p className="mt-2 max-w-[620px] font-serif text-[14px] leading-[22px] tracking-[-0.01em] text-black/60">
        {note}
      </p>
      <p className="mt-2 font-sans text-[12px] leading-4 tracking-[0.05em] text-black/30">
        pin {side} · {angle}° · {duration}ms · {easing}
      </p>
      <div className="mt-10 flex flex-wrap gap-x-16 gap-y-16">
        {rows.map((r) => (
          <PinnedCard key={r.id} row={r} angle={angle} duration={duration} easing={easing} side={side} />
        ))}
      </div>
    </section>
  )
}

export default async function PinPreview() {
  const rows = await getRows()
  if (!rows.length) {
    return <main className="min-h-screen p-10"><p className="font-serif text-black/60">No card images readable here.</p></main>
  }

  return (
    <main className="min-h-screen">
      <style dangerouslySetInnerHTML={{ __html: PIN_CSS }} />
      <div className="mx-auto max-w-[1200px] px-10 py-16">
        <BracketLabel className="text-black/30">Scratchpad</BracketLabel>
        <h1 className="mt-4 font-sans text-[20px] font-[600] leading-6 text-ink">
          Pinned to the board
        </h1>
        <p className="mt-3 max-w-[660px] font-serif text-[14px] leading-[22px] tracking-[-0.01em] text-black/60">
          Hover any card. The tack goes in first, then the card swings down from
          it. The pivot is the tack itself and the tack doesn&rsquo;t turn — those
          two things are what make it read as hanging rather than tilting. True
          physics would rest at <strong>atan(w/h)</strong>, about 37° for these,
          so every variant below is a damped version of the same motion.
        </p>

        <div className="mt-16">
          <Variant
            n="1"
            name="Held on the right"
            note="Tack top-right, so the card swings counter-clockwise and its LEFT side drops. This is what a right-hand pin actually does — the earlier version rotated the other way, which lifted the top-left corner and read as being held on the left."
            rows={rows}
            side="right"
            angle={2.4}
            duration={820}
            easing="cubic-bezier(0.33, 1.06, 0.36, 1)"
          />
          <Variant
            n="2"
            name="Held on the left"
            note="The mirror: tack top-left, card swings clockwise, RIGHT side drops. Same motion, opposite corner — pick whichever matches what you pictured."
            rows={rows}
            side="left"
            angle={2.4}
            duration={820}
            easing="cubic-bezier(0.33, 1.06, 0.36, 1)"
          />

          <div className="mb-10 border-t border-black/[0.06] pt-10">
            <h2 className="font-sans text-[20px] font-[600] leading-6 text-ink">How soft the landing is</h2>
            <p className="mt-2 max-w-[620px] font-serif text-[14px] leading-[22px] tracking-[-0.01em] text-black/60">
              All three are D — no bounce. They differ only in how the card
              arrives. Hover the same card in each to feel it.
            </p>
          </div>

          <Variant
            n="3a"
            name="Cushioned"
            note="A hair of give at the end — the card meets its rest angle and absorbs it rather than stopping dead. Barely a tenth of a degree past, so it never reads as a bounce."
            rows={rows}
            side="right"
            angle={2.4}
            duration={820}
            easing="cubic-bezier(0.33, 1.06, 0.36, 1)"
          />
          <Variant
            n="3b"
            name="Long tail"
            note="No overshoot at all, but a very long deceleration — most of the time is spent in the last fraction of a degree. Softest arrival, and the slowest to feel finished."
            rows={rows}
            side="right"
            angle={2.4}
            duration={900}
            easing="cubic-bezier(0.16, 1, 0.3, 1)"
          />
          <Variant
            n="3c"
            name="Gentle start"
            note="Eases in as well as out, so the card doesn't leap off the mark. Reads as weight — it takes a moment to get going, like something heavy on a pin."
            rows={rows}
            side="right"
            angle={2.4}
            duration={780}
            easing="cubic-bezier(0.4, 0, 0.2, 1)"
          />
        </div>
      </div>
    </main>
  )
}
