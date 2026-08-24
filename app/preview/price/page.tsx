import { createSupabaseServer } from '@/lib/supabase/server'
import { pickProduct } from '@/lib/metadata'
import { pickCardImage } from '@/lib/cardImage'
import { BracketLabel } from '@/components/BulletinHeader'

// Scratchpad — where a PRODUCT card should say its price.
//
// Driven entirely by real saves: every card below is one of Tim's own product
// bookmarks, and every price is resolved at RENDER time by the real
// pickProduct() from lib/metadata, reading the schema.org/Product JSON-LD that
// was already stored in raw_metadata at save time. No migration, no backfill,
// no new capture — the same shape as lib/cardTitle, which normalises titles at
// render rather than rewriting rows.
//
// 26 of Tim's 28 product cards resolve to a price this way, across USD, EUR,
// MYR and AUD, so this is a treatment question, not a data question.
//
// Not linked anywhere. Delete once a treatment is chosen.

export const dynamic = 'force-dynamic'

// The tall card, per the design tokens (--card-w / --card-h).
const PLATE_W = 260

type Row = {
  id: string
  title: string
  host: string
  image: string
  price: string
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

async function getRows(): Promise<Row[]> {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('bookmarks')
    .select('id, title, url, image_url, screenshot_url, card_type, image_pref, raw_metadata')
    .eq('card_type', 'product')
    .limit(200)

  const candidates: Row[] = []
  for (const b of (data || []) as any[]) {
    const product = pickProduct(b.raw_metadata)
    // A published price of 0 is not a price. Several SaaS "products" declare
    // offers.price: 0 for a free tier, and "$0" in the slot where a shopper
    // expects a number reads as broken rather than as free.
    if (!product?.priceFormatted || product.price === 0) continue
    const image = pickCardImage(b.url, b.image_url, b.screenshot_url, b.card_type, b.image_pref)
    if (!image) continue
    candidates.push({
      id: b.id,
      title: b.title || hostOf(b.url),
      host: hostOf(b.url),
      image,
      price: product.priceFormatted,
    })
  }

  // Some product art has rotted — remote og:images on hosts that moved or
  // removed them (myhabits.io, static.pushd.com both 404 today). That's a real
  // finding about card rot, but it makes a poor treatment comparison, so check
  // availability and take the first four that actually render.
  const checked = await Promise.all(
    candidates.slice(0, 20).map(async (row) => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 6000)
        const res = await fetch(row.image, {
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
          signal: controller.signal,
        })
        clearTimeout(timeout)
        const ok = res.ok && (res.headers.get('content-type') || '').startsWith('image/')
        return ok ? row : null
      } catch {
        return null
      }
    })
  )
  return checked.filter(Boolean).slice(0, 4) as Row[]
}

// ── The plate, shared by every treatment ────────────────────────────────────
// Metrics from the live PrimaryCard rather than the handoff: .card-lift is the
// one card treatment in this codebase now, so the handoff's `0 4px 18px` resting
// shadow is the OLD lift it replaced.
function Plate({
  row,
  children,
  caption,
}: {
  row: Row
  children?: React.ReactNode
  caption: string
}) {
  return (
    <div style={{ width: PLATE_W }}>
      <div className="relative w-full overflow-hidden rounded-[20px] bg-card card-lift">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={row.image} alt="" className="block h-auto w-full" />
        {/* The foot gradient the real card uses to dissolve the image into the page. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[19%] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,#FFFFFF_100%)]"
        />
        {children}
      </div>
      <p className="mt-5 line-clamp-2 font-sans text-[14px] font-[400] leading-5 tracking-[0.05em] text-black/[0.56]">
        {row.title}
      </p>
      <p className="mt-2 font-sans text-[12px] leading-4 tracking-[0.05em] text-black/30">
        {caption}
      </p>
    </div>
  )
}

function Section({
  n,
  name,
  note,
  children,
}: {
  n: string
  name: string
  note: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-20">
      <BracketLabel className="text-black/30">{n}</BracketLabel>
      <h2 className="mt-3 font-sans text-[20px] font-[600] leading-6 text-ink">{name}</h2>
      <p className="mt-2 max-w-[640px] font-serif text-[14px] leading-[22px] tracking-[-0.01em] text-black/60">
        {note}
      </p>
      <div className="mt-8 flex flex-wrap gap-x-10 gap-y-12">{children}</div>
    </section>
  )
}

export default async function PricePreview() {
  const rows = await getRows()

  if (!rows.length) {
    return (
      <main className="min-h-screen p-10">
        <p className="font-serif text-[14px] text-black/60">
          No product bookmarks with a resolvable price were readable here.
        </p>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-10 py-16">
        <BracketLabel className="text-black/30">Scratchpad</BracketLabel>
        <h1 className="mt-4 font-sans text-[20px] font-[600] leading-6 text-ink">
          Where a product card says its price
        </h1>
        <p className="mt-3 max-w-[680px] font-serif text-[14px] leading-[22px] tracking-[-0.01em] text-black/60">
          Real saves, real prices. Each is read at render from the schema.org
          JSON-LD already sitting in <code>raw_metadata</code> — 26 of 28 product
          cards resolve, so nothing needs collecting. The same four cards run
          through every treatment, because the question isn&rsquo;t whether a
          price chip looks good in isolation, it&rsquo;s whether it survives a
          white studio product shot.
        </p>

        <div className="mt-14">
          <Section
            n="A"
            name="Top-left overlay"
            note="The handoff's pick: Mier Bold 14 at 85% white, 20px from the top-left of the image. Reads beautifully on a dark photo — and note what happens on the pale ones, which is most of retail."
          >
            {rows.map((row) => (
              <Plate key={row.id} row={row} caption={row.host}>
                <span className="absolute left-5 top-[18px] font-sans text-[14px] font-[700] leading-[12px] text-white/85">
                  {row.price}
                </span>
              </Plate>
            ))}
          </Section>

          <Section
            n="B"
            name="Top-left overlay, with a scrim"
            note="Identical position and type, over a soft top-down shade. Keeps the handoff's look on dark art and stops it disappearing on light art — the cheapest fix if you like A."
          >
            {rows.map((row) => (
              <Plate key={row.id} row={row} caption={row.host}>
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-[34%] bg-[linear-gradient(180deg,rgba(0,0,0,0.38)_0%,rgba(0,0,0,0)_100%)]"
                />
                <span className="absolute left-5 top-[18px] font-sans text-[14px] font-[700] leading-[12px] text-white/95">
                  {row.price}
                </span>
              </Plate>
            ))}
          </Section>

          <Section
            n="C"
            name="Price plate, bottom-left"
            note="Borrows the 28px white plate the favicon already uses, holding the price instead. Legible on any image by construction, and it reuses a mechanism the system has rather than adding one. Costs the favicon its slot."
          >
            {rows.map((row) => (
              <Plate key={row.id} row={row} caption={row.host}>
                <span className="absolute bottom-3 left-3 flex h-7 items-center rounded-[6px] bg-white px-2 font-sans text-[12px] font-[600] leading-4 tracking-[0.02em] text-ink shadow-[0_1px_4px_rgba(0,0,0,0.15)]">
                  {row.price}
                </span>
              </Plate>
            ))}
          </Section>

          <Section
            n="D"
            name="No overlay — price in the caption"
            note="Nothing on the image at all; the price joins the domain on the caption line. Quietest, never fights the photo, and the only one that can't be illegible. Also the easiest to miss when scanning a grid."
          >
            {rows.map((row) => (
              <Plate key={row.id} row={row} caption={`${row.host} · ${row.price}`} />
            ))}
          </Section>
        </div>
      </div>
    </main>
  )
}
