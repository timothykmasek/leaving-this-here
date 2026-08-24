'use client'

import { memo, useCallback, useState } from 'react'
import { cardImageCandidates } from '@/lib/cardImage'
import { CardThumb } from '@/components/CardThumb'
import { FaviconPlate } from '@/components/FaviconPlate'
import { formatCardTitle } from '@/lib/cardTitle'
import { resolveCategory, type Affordance } from '@/lib/cardFormat'
import type { CardType } from '@/lib/cardType'
import type { PlaceMeta } from '@/lib/placeLink'
import type { ProductFact } from '@/lib/productFact'

// ── Bulletin DS "Primary Card" (Figma symbol 886:3378) ──────────────────────
// The redesign's saved-page card, one flexible primitive:
//   plate  → the image at its NATURAL aspect, clipped by a rounded rect. No
//            forced crop, no white letterbox — each card is the shape of its
//            image, so the feed reads as a true masonry.
//   overlay→ a small per-type affordance (play / disc / mic / source favicon)
//   caption→ below the plate: a ONE-LINE title (Mier), and — only if the bullet
//            is in a list — a second Cardo line naming that list (tick + name).
//            No list → no second line → the card is shorter.
// Reuses the CardThumb fallback chain (og → screenshot → favicon plate). No
// category label overlay — categories live off-card (removed 2026-08-15).

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// Per-type affordance overlay — the visual cue for what KIND of thing this is.
// `play` (Video) is the big centred one; `disc`/`mic` (Music/Podcast) are small
// corner badges; `favicon` (Article) tucks the source mark bottom-left — but only
// over real imagery (`hasImage`), since an imageless card already shows the
// favicon centred in its FaviconPlate. `price` (Product) is the top-left chip.
// `avatar` still needs data we don't have, so it renders nothing.
function AffordanceOverlay({ kind, faviconUrl, hasImage, price }: { kind: Affordance; faviconUrl?: string | null; hasImage: boolean; price?: string | null }) {
  if (kind === 'price') {
    // A white plate rather than bare text on the photo. The design handoff's
    // overlay is Mier Bold at 85% WHITE directly on the image, which is
    // unreadable on real retail art — product photography is overwhelmingly
    // pale, and every one of Tim's own product saves washed it out (see
    // /preview/price). The chip is legible on any image by construction, and
    // it's the same 6px white plate the favicon affordance uses, so this fills
    // an existing slot with an existing mechanism.
    if (!price) return null
    return (
      <span className="absolute left-3 top-3 z-[2] flex h-7 items-center rounded-[6px] bg-white px-2 font-sans text-[12px] font-[600] leading-4 tracking-[0.02em] text-ink shadow-[0_1px_4px_rgba(0,0,0,0.15)]">
        {price}
      </span>
    )
  }
  if (kind === 'play') {
    return (
      <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-black/[0.45] backdrop-blur-[2px] ring-1 ring-white/25">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M8 5v14l11-7z" /></svg>
        </span>
      </span>
    )
  }
  if (kind === 'disc' || kind === 'mic') {
    return (
      <span aria-hidden className="pointer-events-none absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.45] backdrop-blur-[2px] ring-1 ring-white/25">
        {kind === 'disc' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" aria-hidden><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="1.6" fill="#fff" /></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" aria-hidden><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" /></svg>
        )}
      </span>
    )
  }
  if (kind === 'favicon' && faviconUrl && hasImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={faviconUrl}
        alt=""
        aria-hidden
        className="pointer-events-none absolute bottom-3 left-3 h-6 w-6 rounded-[6px] bg-white/90 p-[3px] shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return null
}

// The hero photo as a CSS-clipped window onto the capture. The maths: mapping
// the box's width to 100% of the frame means scaling the image by 1/w, and the
// offsets are then the box origin in units of the box itself — so only the
// FRACTIONS are needed, plus the capture's aspect for the frame.
function PlacePhoto({ src, box }: { src: string; box: NonNullable<PlaceMeta['photoBox']> }) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ aspectRatio: `${box.w * box.sourceAspect} / ${box.h}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="absolute max-w-none"
        style={{
          width: `${100 / box.w}%`,
          left: `${(-box.x / box.w) * 100}%`,
          top: `${(-box.y / box.h) * 100}%`,
        }}
      />
    </div>
  )
}

// The Place card's in-plate facts — name, category, price, rating, address.
// A deliberate exception to "categories live off-card" (removed 2026-08-15):
// for a place the attributes ARE the content, which is not true of the link
// taxonomy that rule was written about. Signed off by Tim 2026-08-21.
//
// Every line maps to an existing DS text style; none are invented here:
//   name        Mier A Book 14/20/5%  — the card-title style (Figma ProjectX)
//   category    `.label` 10/12/1.5px  — the uppercase metadata workhorse
//   facts+addr  Mier A 12/16/5%       — the small-body style used across MobileHome
// Deliberately NOT Cardo: the palette scopes serif to editorial voice (bios,
// taglines, quotes, list titles, the list line). A rating and a street address
// are data. The list line UNDER the card stays Cardo, which is correct and also
// keeps it visually distinct from the facts inside the plate.
//
// Opening hours are deliberately absent: they're perishable, and this is stored.
function PlaceFacts({ place }: { place: PlaceMeta }) {
  const meta = [place.kind, place.price].filter(Boolean).join(' · ')
  const counts = [
    place.rating ? `★ ${place.rating}` : null,
    place.reviews ? `${place.reviews} reviews` : null,
  ].filter(Boolean)
  return (
    <div className="px-5 pb-5 pt-4">
      {place.name && (
        <p className="truncate font-sans text-[14px] font-[400] leading-5 tracking-[0.05em] text-black/[0.56]">
          {place.name}
        </p>
      )}
      {meta && <p className="label mt-2 text-ink/[0.45]">{meta}</p>}
      {counts.length > 0 && (
        <p className="mt-2.5 flex items-center gap-2 font-sans text-[12px] leading-4 tracking-[0.05em] text-ink/[0.55]">
          {counts.map((c, i) => (
            <span key={c} className={i === 0 ? 'text-ink/70' : undefined}>
              {i > 0 && <span aria-hidden className="mr-2 text-ink/25">·</span>}
              {c}
            </span>
          ))}
        </p>
      )}
      {place.address && (
        <p className="mt-1.5 truncate font-sans text-[12px] leading-4 tracking-[0.05em] text-ink/[0.45]">
          {place.address}
        </p>
      )}
    </div>
  )
}

interface PrimaryCardProps {
  id?: string
  url: string
  title: string | null
  description?: string | null
  imageUrl: string | null
  screenshotUrl: string | null
  faviconUrl?: string | null
  rawMetadata?: any
  cardType?: CardType | null
  imagePref?: string | null
  // Place facts, for Maps bullets. Selected narrowly as `place:raw_metadata->place`
  // rather than by pulling the whole raw_metadata blob for every card in a
  // 1000-bullet grid. Falls back to rawMetadata.place for callers that do pass
  // the full blob.
  place?: PlaceMeta | null
  // The product's price, for retail bullets. Selected narrowly the same way, as
  // `product:raw_metadata->product` — see lib/productFact for why the JSON-LD
  // it's derived from is not worth selecting per card.
  product?: ProductFact | null
  // The list this bullet belongs to (if any). Present → the second caption line
  // renders and the card is taller; absent → no line, shorter card.
  listName?: string | null
  // The list's public page — makes the list line a link. Null → plain text.
  listHref?: string | null
  // Owner view: adds a hover pencil that opens the bullet-detail modal. The card
  // itself always goes to the link. Requires `id`.
  onOpen?: (id: string) => void
}

export const PrimaryCard = memo(function PrimaryCard({
  id, url, title, description, imageUrl, screenshotUrl, faviconUrl, rawMetadata,
  cardType, imagePref, place: placeProp, product: productProp, listName, listHref, onOpen,
}: PrimaryCardProps) {
  const domain = getDomain(url)
  const fmt = resolveCategory(url, cardType)
  const cleanTitle = formatCardTitle({
    title, description, url, siteName: rawMetadata?.og?.site_name ?? null,
  })
  const candidates = cardImageCandidates(url, imageUrl, screenshotUrl, cardType, imagePref)
  // Place bullets carry their facts in raw_metadata.place (written by
  // scripts/enrich-places.js). Absent → the card renders as any other.
  const placeMeta = placeProp ?? rawMetadata?.place ?? null
  const place: PlaceMeta | null =
    fmt.category === 'Place' && placeMeta?.name ? placeMeta : null
  // Product bullets carry their price the same way, in raw_metadata.product,
  // narrowed into the grid's select. Absent → no chip, never an empty pill.
  const product: ProductFact | null = productProp ?? rawMetadata?.product ?? null
  // Two ways a place gets its picture: the backfill script cuts a real file, the
  // save path stores a box to clip out of the capture. A cut file wins — it's a
  // fraction of the bytes.
  // A card whose image is light at the edges bleeds into the white page, so it
  // gets the same hairline the Place card uses. Measured from the pixels that
  // actually rendered — see lib/imageLightness.
  const [lightEdges, setLightEdges] = useState(false)
  const handleEdgeLightness = useCallback((light: boolean | null) => {
    setLightEdges(light === true)
  }, [])

  // The foot-fade only means anything over a real image; an imageless card
  // shows the favicon plate and has no photo to dissolve.
  const hasFade = !place && candidates.length > 0

  const placePhoto =
    place && !place.photo && place.photoBox && screenshotUrl
      ? { src: screenshotUrl, box: place.photoBox }
      : null

  // The clickable card (plate + title). The list line lives OUTSIDE this so it
  // can be its own link (no <a> nested in an <a>).
  const card = (
    <>
      {/* The plate — the image at natural aspect, rounded + clipped. */}
      {/* Place cards sit on white; every other card keeps the grey plate. Setting
          it on the PLATE (not just the facts block) so a place with no capture
          renders one uniform card rather than a grey favicon plate stacked on a
          white facts block. */}
      {/* The hairline (Figma ProjectX: #EBEBEB, 1px, inside, radius 20) goes on
          a Place card, which is always white, and on any card whose image
          measured LIGHT at its edges — those bleed into the white page exactly
          the same way. Darker cards keep the grey plate, whose own fill is the
          edge, and don't get a rim drawn over the photo.

          NOTE the Place hairline is a BORDER, not `ring-1`. Tailwind implements
          ring as a box-shadow, and `.card-lift` sets box-shadow directly — so it
          wins the cascade and the ring never paints. (True of the ring-1 on the
          non-place branch below too: it has never rendered. Left as-is here
          because removing it is a visual change to every card, not this one.) */}
      <div className="relative w-full">
      <div
        className={`relative w-full overflow-hidden rounded-[20px] card-lift ${
          place ? 'bg-paper' : 'bg-card'
        } ${
          place || lightEdges ? 'border border-[#EBEBEB]' : 'ring-1 ring-black/[0.03]'
        } ${
          // Has a foot-fade and no border to define it → let it dissolve
          // cleanly. A light card keeps its resting shadow because its border
          // is already a deliberate edge; a Place card has no fade at all.
          hasFade && !place && !lightEdges ? 'card-lift-flat' : ''
        }`}
      >
        {/* Own stacking context so the affordance pins to the IMAGE, not the
            plate — a Place card puts a text block below the image. */}
        <div className="relative">
          {placePhoto ? (
            <PlacePhoto src={placePhoto.src} box={placePhoto.box} />
          ) : (
          <CardThumb
            candidates={candidates}
            onEdgeLightness={handleEdgeLightness}
            className="block w-full h-auto"
            // No image → the favicon plate, given the type's fallback shape.
            fallback={
              <div className="w-full" style={{ aspectRatio: fmt.aspect }}>
                <FaviconPlate faviconUrl={faviconUrl} domain={domain} />
              </div>
            }
          />
          )}

          {/* Foot-fade — the image dissolves into the page at its bottom edge.
              Figma ProjectX: linear-gradient(180deg, rgba(255,255,255,0), #FFFFFF)
              over a "Gradients" group 93.2px tall on a ~484px image, i.e. the
              bottom ~19%.

              It previously stopped at 70% white, which is why it read as haze
              rather than a dissolve: the image stayed visible right to the cut.
              Written out in full rather than with Tailwind's gradient stop
              utilities, so the end stop is unambiguously solid white.

              Skipped on a Place card, where the image meets its facts block
              rather than the page. */}
          {hasFade && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[19%] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,#FFFFFF_100%)]"
            />
          )}

          {/* Per-type affordance (play / disc / mic / source favicon). */}
          <AffordanceOverlay
            kind={fmt.affordance}
            faviconUrl={faviconUrl}
            hasImage={candidates.length > 0}
            price={product?.priceFormatted}
          />
        </div>

        {place && <PlaceFacts place={place} />}
      </div>

      {/* Backdrop scrim — Figma ProjectX "Rectangle 5111": 45px tall, sitting
          BELOW the card (top 439.2 on a 439.2-tall card), white at the card's
          edge fading down to transparent.
          
          What it's for: the page carries a fixed dot grid (.dot-ground), so a
          card whose foot-fade ends in white meets dots immediately below it.
          This softens that band, which is what lets the card melt into the page
          instead of stopping at one. Only meaningful where there's a fade. */}
      {hasFade && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-full z-0 h-[45px] bg-[linear-gradient(180deg,#FFFFFF_0%,rgba(255,255,255,0)_100%)]"
        />
      )}
      </div>

      {/* Title — Figma ProjectX "Body/Large": Mier A Book, 14/20, 0.05em,
          color rgba(0,0,0,0.7) with the layer at opacity 0.8. Figma multiplies
          those, so the rendered alpha is 0.56 — hence text-black/[0.56], not
          /70 or /80.

          The export reads `font-weight: 500`. Do NOT copy that number here.
          MierA-Book.woff2 declares usWeightClass 500 internally, but app/fonts.ts
          registers it at 400 (and MierA-Regular, which is internally 400, at
          500). So font-[400] IS Book; font-[500] would load Regular and quietly
          change the cut. Overflow FADES to transparent at the
          right edge (mask gradient) rather than a hard "…" ellipsis. */}
      {/* A Place card states its name inside the plate, so the caption title
          would say it twice. The LIST line below still renders — that's a
          different fact, and the only one the plate doesn't carry. */}
      {cleanTitle && !place && (
        <p className="relative z-10 mt-5 overflow-hidden whitespace-nowrap font-sans text-[14px] font-[400] leading-5 tracking-[0.05em] text-black/[0.56] [-webkit-mask-image:linear-gradient(to_right,#000_88%,transparent)] [mask-image:linear-gradient(to_right,#000_88%,transparent)]">
          {cleanTitle}
        </p>
      )}
    </>
  )

  return (
    <div className="w-full">
      {/* The card always goes to the original link — owner or not. Owners get the
          detail/edit view from the hover pencil below (a button can't nest inside
          the anchor, so it's an absolutely-positioned sibling). */}
      <div className="group relative w-full">
        <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full">
          {card}
        </a>

        {onOpen && id && (
          <button
            type="button"
            onClick={() => onOpen(id)}
            aria-label="edit bullet"
            title="edit"
            // Top-right of the plate — bottom corners belong to the disc/mic
            // affordances. Desktop only: revealed on hover, hidden outright on
            // touch (a pencil pinned to every card reads as clutter), so mobile
            // taps just open the link.
            // No backdrop-blur here: the plate next to it is promoted to its own
            // compositing layer by .card-lift's transform, and a backdrop-filter
            // sampling across that boundary renders the chip invisible once the
            // transform settles — the pencil appeared only mid-transition, then
            // vanished. bg-white/90 over a photo reads fine without the blur.
            className="absolute right-3 top-3 z-[2] flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-sm transition-opacity hover:text-ink [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:none)]:hidden"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        )}
      </div>

      {/* List line — Cardo 14px with a three-dot (⋮) tick; links to the list's
          page when it has one. Only rendered when the bullet is in a list. */}
      {listName && (() => {
        const inner = (
          <>
            <span aria-hidden className="flex shrink-0 flex-col items-center justify-center gap-[2px] opacity-60">
              <span className="h-[2px] w-[2px] rounded-full bg-current" />
              <span className="h-[2px] w-[2px] rounded-full bg-current" />
              <span className="h-[2px] w-[2px] rounded-full bg-current" />
            </span>
            <span className="truncate">{listName}</span>
          </>
        )
        const cls = `relative z-10 ${place ? 'mt-5' : 'mt-1.5'} flex items-center gap-[7px] font-serif text-[14px] leading-[18px] tracking-[-0.01em] text-ink/[0.55]`
        return listHref ? (
          <a href={listHref} className={`${cls} transition-colors hover:text-ink`}>{inner}</a>
        ) : (
          <p className={cls}>{inner}</p>
        )
      })()}
    </div>
  )
})
