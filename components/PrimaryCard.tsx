'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { cardImageCandidates } from '@/lib/cardImage'
import { CardThumb } from '@/components/CardThumb'
import { CardFallback } from '@/components/CardFallback'
import { formatCardTitle, isObstacleCopy } from '@/lib/cardTitle'
import { resolveCategory, showsSourceMark, type Affordance } from '@/lib/cardFormat'
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
// favicon centred in its fallback card. `price` (Product) is the top-left chip.
// `price` (Product) and `rating` (Place) are the same top-left METRIC chip,
// taking a pre-formatted string — the handoff's one slot for "the fact worth
// knowing before you click", whatever the type supplies. `avatar` still needs
// data we don't have, so it renders nothing.
function AffordanceOverlay({ kind, faviconUrl, hasImage, metric, markShown }: { kind: Affordance; faviconUrl?: string | null; hasImage: boolean; metric?: string | null; markShown?: boolean }) {
  if (kind === 'price' || kind === 'rating') {
    // Bottom-left, the card's tag corner — the same one the source mark uses.
    // Safe today because the two never co-occur: the metric belongs to Product
    // and Place, the mark to Social/Music/Podcast/Video, and those sets are
    // disjoint. That stops being true the moment Video gets a duration, which
    // is why the handoff put duration bottom-RIGHT as a pill.
    //
    // A white plate rather than bare text on the photo. The design handoff's
    // overlay is Mier Bold at 85% WHITE directly on the image, which is
    // unreadable on real retail art — product photography is overwhelmingly
    // pale, and every one of Tim's own product saves washed it out (see
    // /preview/price). The chip is legible on any image by construction, and
    // it's the same 6px white plate the favicon affordance uses, so this fills
    // an existing slot with an existing mechanism.
    if (!metric) return null
    return (
      <span className="absolute bottom-[20px] left-[20px] z-[2] flex h-7 items-center rounded-[6px] bg-white px-2 font-sans text-[12px] font-[600] leading-4 tracking-[0.02em] text-ink shadow-[0_1px_4px_rgba(0,0,0,0.15)]">
        {metric}
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
  // The drawn glyph is a FALLBACK, not a companion: it stands in when the real
  // source mark isn't there to take the slot. A Spotify track was showing both —
  // the logo bottom-left and a generic record bottom-right — which is exactly
  // the thing the mark was introduced to replace. Broke when the mark moved to
  // being category-driven and this branch stopped knowing about it.
  if ((kind === 'disc' || kind === 'mic') && !markShown) {
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
  return null
}

// The site's own mark, bottom-left. A Spotify save shows Spotify's logo, a
// LinkedIn post LinkedIn's — every domain, with no brand assets to license,
// draw or keep current, because it's the favicon already on the row.
//
// Its own component because a favicon 404s more often than a card image does,
// and a plain onError is not enough to catch it. The <img> is server-rendered
// and starts loading immediately; if it fails BEFORE React hydrates and
// attaches the handler, that error event is lost and a broken-image box sits
// on the card forever. So the ref checks on mount whether the image has
// already failed (complete, but zero natural width) as well. Same fix, and the
// same reasoning, as CardThumb's fallback chain.
function SourceMark({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const img = ref.current
    if (img && img.complete && img.naturalWidth === 0) setFailed(true)
  }, [src])
  if (failed) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt=""
      aria-hidden
      className="pointer-events-none absolute bottom-[20px] left-[20px] z-[1] h-6 w-6 rounded-[6px] bg-white/90 p-[3px] shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
      onError={() => setFailed(true)}
    />
  )
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

// A Place card is an ordinary card now.
//
// It used to state its facts in a white block inside the plate, as a deliberate
// exception ("for a place the attributes ARE the content"), signed off
// 2026-08-21 and reversed by Tim 2026-08-24: a bespoke card in a grid of
// uniform ones reads as a different object, not a richer one. The facts didn't
// disappear — the rating is the photo's metric chip, and the name, category and
// street are the title line, in the same slot every other card uses.
//
// Deliberately just the STREET, not the full address. Google's is "1 Rue du
// Sabot, 75006 Paris, France"; the postcode and country earn nothing on a card
// that already fades its title at the right edge.

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
  /** The owner's own picture for this bullet (raw_metadata.customImage),
   *  selected narrowly like place and product. Beats og/screenshot. */
  customImage?: string | null
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
  cardType, imagePref, place: placeProp, product: productProp,
  customImage: customImageProp, listName, listHref, onOpen,
}: PrimaryCardProps) {
  const domain = getDomain(url)
  const fmt = resolveCategory(url, cardType)
  const cleanTitle = formatCardTitle({
    title, description, url, siteName: rawMetadata?.og?.site_name ?? null,
  })
  // The owner's own picture, when they've set one, beats the automatic chain.
  const customImage = customImageProp ?? rawMetadata?.customImage ?? null
  const candidates = cardImageCandidates(url, imageUrl, screenshotUrl, cardType, imagePref, customImage)
  // Place bullets carry their facts in raw_metadata.place (written by
  // scripts/enrich-places.js). Absent → the card renders as any other.
  const placeMeta = placeProp ?? rawMetadata?.place ?? null
  const place: PlaceMeta | null =
    fmt.category === 'Place' && placeMeta?.name ? placeMeta : null
  // Product bullets carry their price the same way, in raw_metadata.product,
  // narrowed into the grid's select. Absent → no chip, never an empty pill.
  const product: ProductFact | null = productProp ?? rawMetadata?.product ?? null
  // "Cherry Paris — Restaurant — 1 Rue du Sabot". Same em-dash join lib/cardTitle
  // uses for "Brand — what it is", so a place reads like everything else.
  const placeTitle = place
    ? [place.name, place.kind, place.address?.split(',')[0]?.trim()]
        .filter(Boolean)
        .join(' \u2014 ')
    : null

  // Does the real source mark take the bottom-left slot? Computed once: the
  // drawn disc/mic glyph reads this to know whether it's needed, and showing
  // both was the bug.
  // Holding an image URL is not the same as that image rendering. An Instagram
  // profile picture 403s for a visitor, the chain exhausts, and the fallback
  // card is what is actually on screen — while candidates.length still says 1.
  // CardThumb tells us which it is.
  const [imageExhausted, setImageExhausted] = useState(false)
  const hasImage = candidates.length > 0 && !imageExhausted

  // No source mark on a card with no image: CardFallback already carries the
  // favicon, and a second copy in the corner landed on top of the domain line.
  const markShown = showsSourceMark(fmt.category) && !!faviconUrl && hasImage
  // The one fact this card puts on its photo. A place's rating reads as one
  // phrase — the star alone is ambiguous, the count alone is meaningless.
  const metric =
    fmt.affordance === 'price'
      ? product?.priceFormatted ?? null
      : fmt.affordance === 'rating' && place?.rating
        ? [`\u2605 ${place.rating}`, place.reviews ? `${place.reviews} reviews` : null]
            .filter(Boolean)
            .join(' \u00b7 ')
        : null
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
  const hasFade = candidates.length > 0

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
          'bg-card'
        } ${
          // A light card WITH a foot-fade gets its hairline from the masked
          // overlay below instead — a container border would trace the bottom
          // edge and corners of a card whose image is busy dissolving there.
          lightEdges && !hasFade ? 'border border-[#EBEBEB]' : ''
        } ${
          !lightEdges ? 'ring-1 ring-black/[0.03]' : ''
        } ${
          // Has a foot-fade → let it dissolve cleanly: the resting shadow
          // pools along exactly the bottom edge the fade erases. This now
          // covers light cards too, since their border no longer defines a
          // bottom edge either. Hover lift still applies — a deliberate raise
          // isn't in conflict with the melt.
          hasFade ? 'card-lift-flat' : ''
        } ${
          // The foot-fade painted into the plate's OWN background as well.
          // bg-card is a separate paint layer under the image, and the browser
          // antialiases each layer against the corner clip independently — so
          // on retina a sub-pixel grey rim of bg-card survives at the bottom
          // corners even though everything above it has faded white. With the
          // background itself white at the foot, the corner AA blends white on
          // white: no layer left to fringe. Not on a Place card, whose plate
          // ends in a facts block, not the fade.
          hasFade && !place
            ? 'bg-[linear-gradient(180deg,rgba(255,255,255,0)_78%,#FFFFFF_92%)]'
            : ''
        }`}
      >
        {/* Own stacking context so the affordance pins to the IMAGE, not the
            plate — a Place card puts a text block below the image. */}
        <div className="relative">
          {/* The image + its foot-fade, masked to transparent before the
              corner curve. Whitening the image with an overlay is not enough
              on retina: the image and the overlay are separate paint layers,
              each antialiased against the rounded clip on its own, and a
              sub-pixel arc of image colour survives at the bottom corners.
              Masked to nothing there, the only layer the corner clip touches
              is the plate's own background — solid white at the foot — so
              there is no colour left to fringe. The badges live OUTSIDE this
              wrapper: the price chip and source mark sit in the masked zone
              and must not fade with it. */}
          <div
            className={
              hasFade && !place
                ? '[-webkit-mask-image:linear-gradient(180deg,#000_74%,transparent_94%)] [mask-image:linear-gradient(180deg,#000_74%,transparent_94%)]'
                : undefined
            }
          >
          {placePhoto ? (
            <PlacePhoto src={placePhoto.src} box={placePhoto.box} />
          ) : (
          <CardThumb
            candidates={candidates}
            placeholderAspect={fmt.aspect}
            onEdgeLightness={handleEdgeLightness}
            onExhausted={setImageExhausted}
            className="block w-full h-auto"
            // No image → a real card rather than an apology. Gets the
            // description and the brand, both of which the old favicon plate
            // held and threw away. See components/CardFallback.
            fallback={
              <div className="w-full" style={{ aspectRatio: fmt.aspect }}>
                <CardFallback
                  domain={domain}
                  faviconUrl={faviconUrl}
                  brand={cleanTitle || domain}
                  description={description}
                />
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

              A plain two-stop ramp starts at a constant slope, and the eye
              catches that discontinuity as a hard line where the fade begins
              (Mach banding). The smoothstep stops ease in from zero slope, so
              the top edge is imperceptible; slightly taller to buy room for
              the gentler onset.

              Solid white lands at 90%, not 100%: the corner radius occupies
              the plate's last ~20px, and a fade still 4% short of white there
              lets a dark image ghost through — the rounded clip then cuts
              that haze into a grey arc that reads as a border. Saturating
              before the curve starts means the corners clip pure white
              against the white page: nothing to see, which is the point.

              Skipped on a Place card, where the image meets its facts block
              rather than the page. */}
          {hasFade && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[26%] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.05)_12%,rgba(255,255,255,0.18)_24%,rgba(255,255,255,0.36)_36%,rgba(255,255,255,0.56)_48%,rgba(255,255,255,0.74)_60%,rgba(255,255,255,0.88)_72%,rgba(255,255,255,0.97)_82%,#FFFFFF_90%,#FFFFFF_100%)]"
            />
          )}
          </div>

          {/* Per-type affordance (play / disc / mic / source favicon). */}
          <AffordanceOverlay
            kind={fmt.affordance}
            faviconUrl={faviconUrl}
            hasImage={hasImage}
            metric={metric}
            markShown={markShown}
          />
          {/* The platform's mark, only where the platform is part of the
              meaning (lib/cardFormat: Social / Music / Podcast / Video). Needs
              a real image on the card — an imageless one already shows the
              favicon carried by CardFallback, so a corner copy is noise. */}
          {markShown && <SourceMark src={faviconUrl!} />}
        </div>

        {/* The light-card hairline, dissolving with the image. On a card whose
            foot fades into the page, a border that keeps tracing the bottom
            edge and corners rebuilds the box the fade just erased — so the
            hairline lives on this overlay and is masked out along the same
            ramp: solid where it defines the top and sides against the white
            page, gone before the bottom corners' curve begins. */}
        {lightEdges && hasFade && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[20px] border border-[#EBEBEB] [-webkit-mask-image:linear-gradient(180deg,#000_74%,transparent_94%)] [mask-image:linear-gradient(180deg,#000_74%,transparent_94%)]"
          />
        )}
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
    </>
  )

  const shownTitle = placeTitle || cleanTitle

  // A card with no picture at all carries its own title, set large — so
  // printing the caption underneath would say the same words twice, which is
  // exactly what was wrong with the plate this replaced. One title, set
  // properly, instead of two.
  //
  // Only when the fallback is showing the TITLE. When it has a description to
  // show instead, the card and the caption are saying different things and both
  // earn their place. Covers runtime failures too, now that CardThumb reports
  // an exhausted chain — an Instagram picture that 403s for a visitor gets the
  // same treatment as a link that never had an image.
  //
  // Uses the same obstacle check CardFallback does, or the two disagree: a
  // login wall's copy is long enough to look like prose here while the card
  // correctly refuses to print it, and the caption came back to say the same
  // words as the card. One rule, read by both.
  const usableDescription = isObstacleCopy(description) ? '' : (description || '').trim()
  const fallbackCarriesTitle = !hasImage && usableDescription.length < 24

  const titleLine = shownTitle && !fallbackCarriesTitle ? (
    <p className="relative z-10 mt-5 overflow-hidden whitespace-nowrap font-sans text-[14px] font-[400] leading-5 tracking-[0.05em] text-black/[0.56] [-webkit-mask-image:linear-gradient(to_right,#000_88%,transparent)] [mask-image:linear-gradient(to_right,#000_88%,transparent)]">
      {shownTitle}
    </p>
  ) : null

  return (
    <div className="w-full">
      {/* The card always goes to the original link — owner or not. Owners get the
          detail/edit view from the hover pencil below (a button can't nest inside
          the anchor, so it's an absolutely-positioned sibling). */}
      <div className="group relative w-full">
        {/* Everything that HANGS is inside .pin-hang — the plate, the link that
            covers it, and the owner's pencil. That containment is the point:
            globals.css records that tilting the plate while the pencil was an
            absolutely-positioned SIBLING promoted the plate to its own
            compositing layer and made the pencil flash in and vanish. Inside
            the transformed element, there's no boundary to cross.
            The tack and the title stay outside — a tack is in the board, and
            the title is on the page, not on the card. */}
        <div className="pin-hang relative">
          {card}

          {/* The link is a stretched overlay now rather than the plate's
              parent, which is exactly the restructure that comment asked for:
              a <button> cannot nest inside an <a>, so with the anchor wrapping
              everything the pencil had nowhere to live but outside. It carries
              the title as its accessible name, since it has no text of its own. */}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={shownTitle || domain}
            className="absolute inset-0 z-[1]"
          />

        {onOpen && id && (
          <button
            type="button"
            onClick={() => onOpen(id)}
            aria-label="edit bullet"
            title="edit"
            // Top-LEFT of the plate. The bottom-left corner is the card's tag
            // corner (price, rating, source mark) and bottom-right belongs to
            // the disc/mic glyphs, so the owner's control takes the one corner
            // no content uses. Desktop only: revealed on hover, hidden outright
            // on touch (a pencil pinned to every card reads as clutter), so
            // mobile taps just open the link.
            // No backdrop-blur here: the plate next to it is promoted to its own
            // compositing layer by .card-lift's transform, and a backdrop-filter
            // sampling across that boundary renders the chip invisible once the
            // transform settles — the pencil appeared only mid-transition, then
            // vanished. bg-white/90 over a photo reads fine without the blur.
            className="absolute left-3 top-3 z-[2] flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-sm transition-opacity hover:text-ink [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:none)]:hidden"
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

        {/* The tack — outside .pin-hang so it stays put while the card turns. */}
        <span aria-hidden className="pin-tack" />

        {/* Title, outside the rotation: it sits on the page, not on the card.
            Wrapped so it stays clickable now the anchor no longer contains it.
            aria-hidden + tabIndex -1 because the stretched overlay above already
            exposes this exact link, under this exact name — two tab stops to one
            destination is worse than one. */}
        {titleLine && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-hidden
            tabIndex={-1}
            className="block"
          >
            {titleLine}
          </a>
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
        const cls = `relative z-10 mt-1.5 flex items-center gap-[7px] font-serif text-[14px] leading-[18px] tracking-[-0.01em] text-ink/[0.55]`
        return listHref ? (
          <a href={listHref} className={`${cls} transition-colors hover:text-ink`}>{inner}</a>
        ) : (
          <p className={cls}>{inner}</p>
        )
      })()}
    </div>
  )
})
