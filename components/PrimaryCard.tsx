'use client'

import { memo } from 'react'
import { cardImageCandidates } from '@/lib/cardImage'
import { CardThumb } from '@/components/CardThumb'
import { FaviconPlate } from '@/components/FaviconPlate'
import { formatCardTitle } from '@/lib/cardTitle'
import { cardFormat } from '@/lib/cardFormat'
import type { CardType } from '@/lib/cardType'

// ── Bulletin DS "Primary Card" (Figma symbol 886:3378) ──────────────────────
// The redesign's saved-page card, rebuilt as ONE flexible primitive. Structure
// mirrors the Figma layer tree:
//   Mask group   → oversized image clipped by a rounded rect (aspect = the knob)
//   label        → category text overlaid top-left
//   Gradients    → soft foot-fade to paper at the bottom
//   (title)      → sits BELOW the plate, muted
// Every per-type template in the DS sheet is this card with a different `aspect`
// + affordance — so the mask aspect is a prop, defaulting to the type's format.
//
// Reuses the existing CardThumb fallback chain (og → screenshot → favicon plate)
// so a broken image degrades exactly like today's card.

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

interface PrimaryCardProps {
  url: string
  title: string | null
  description?: string | null
  imageUrl: string | null
  screenshotUrl: string | null
  faviconUrl?: string | null
  rawMetadata?: any
  cardType?: CardType | null
  imagePref?: string | null
  // Overrides (default to the card_type's format from cardFormat()).
  aspect?: string
  category?: string
  categoryColor?: string
  // Show the category label overlay. Off for a bare image card.
  showLabel?: boolean
}

export const PrimaryCard = memo(function PrimaryCard({
  url, title, description, imageUrl, screenshotUrl, faviconUrl, rawMetadata,
  cardType, imagePref, aspect, category, categoryColor, showLabel = true,
}: PrimaryCardProps) {
  const domain = getDomain(url)
  const fmt = cardFormat(cardType)
  const cleanTitle = formatCardTitle({
    title, description, url, siteName: rawMetadata?.og?.site_name ?? null,
  })
  const candidates = cardImageCandidates(url, imageUrl, screenshotUrl, cardType, imagePref)
  const label = category ?? fmt.label

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block w-full"
    >
      {/* The plate — rounded mask holding the full-bleed image. */}
      <div
        className="relative w-full overflow-hidden rounded-[20px] bg-card shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition-shadow group-hover:shadow-[0_10px_30px_rgba(0,0,0,0.12)]"
        style={{ aspectRatio: aspect ?? fmt.aspect }}
      >
        {/* Mask group: image fills + covers the plate. */}
        <CardThumb
          candidates={candidates}
          className="absolute inset-0 h-full w-full object-cover"
          fallback={<FaviconPlate faviconUrl={faviconUrl} domain={domain} />}
        />

        {/* Gradients: soft foot-fade to paper (~21% of a 439 plate). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-b from-transparent to-paper/80"
        />

        {/* Category label — Cardo bold 14px, top-left. White by default with a
            soft shadow so it survives light imagery (DS: white on imagery). */}
        {showLabel && (
          <span
            className="absolute left-5 top-[18px] font-serif text-[14px] font-bold leading-[12px] [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]"
            style={{ color: categoryColor ?? '#ffffff' }}
          >
            {label}
          </span>
        )}
      </div>

      {/* Title — below the plate, muted (DS: ink-70 @ .8). */}
      {cleanTitle && (
        <p className="mt-3 font-serif text-[13px] leading-snug text-ink/70">
          {cleanTitle}
        </p>
      )}
    </a>
  )
})
