'use client'

import { memo, useEffect, useState } from 'react'
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

// Adaptive label colour. The label sits top-left over the image; pick dark ink
// on a light corner, white on a dark one, so it never disappears. We sample the
// top-left region via a probe <img> with crossOrigin — works when the host
// sends CORS (Supabase screenshots do); on a tainted/failed probe we keep the
// white default (+ shadow). `contain` cards sit on a white plate, so their
// top-left is white → always dark ink, no sampling needed.
// NOTE: the robust production version computes this once at save time server-
// side; this client probe is for the /preview iteration.
function useAdaptiveLabelDark(src: string | undefined, isContain: boolean): boolean {
  const [dark, setDark] = useState(isContain)
  useEffect(() => {
    if (isContain) { setDark(true); return }
    if (!src) { setDark(false); return }
    let cancelled = false
    const probe = new Image()
    probe.crossOrigin = 'anonymous'
    probe.onload = () => {
      if (cancelled) return
      try {
        const c = document.createElement('canvas')
        c.width = 20; c.height = 20
        const ctx = c.getContext('2d')
        if (!ctx) return
        // Draw the image's top-left ~35%×25% into the sample canvas.
        ctx.drawImage(probe, 0, 0, probe.naturalWidth * 0.35, probe.naturalHeight * 0.25, 0, 0, 20, 20)
        const { data } = ctx.getImageData(0, 0, 20, 20)
        let sum = 0
        for (let i = 0; i < data.length; i += 4) {
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
        }
        const lum = sum / (data.length / 4) / 255
        if (!cancelled) setDark(lum > 0.6)
      } catch { /* tainted (no CORS) — keep the white default */ }
    }
    probe.src = src
    return () => { cancelled = true }
  }, [src, isContain])
  return dark
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
  const isContain = fmt.fit === 'contain'
  const labelDark = useAdaptiveLabelDark(candidates[0], isContain)
  const labelColor = categoryColor ?? (labelDark ? '#2b2b2b' : '#ffffff')

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block w-full"
    >
      {/* The plate — rounded mask holding the image. Contain cards sit on a
          white catalog plate; cover cards on the grey placeholder while loading. */}
      <div
        className={`relative w-full overflow-hidden rounded-[20px] shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition-shadow group-hover:shadow-[0_10px_30px_rgba(0,0,0,0.12)] ${
          isContain ? 'bg-white' : 'bg-card'
        }`}
        style={{ aspectRatio: aspect ?? fmt.aspect }}
      >
        {/* Mask group: cover fills+crops; contain pads the whole image on white. */}
        <CardThumb
          candidates={candidates}
          className={
            isContain
              ? 'absolute inset-0 h-full w-full object-contain p-[9%]'
              : 'absolute inset-0 h-full w-full object-cover'
          }
          fallback={<FaviconPlate faviconUrl={faviconUrl} domain={domain} />}
        />

        {/* Gradients: soft foot-fade to paper — only for cover cards (a contain
            plate is already white, nothing to fade). */}
        {!isContain && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-b from-transparent to-paper/80"
          />
        )}

        {/* Category label — Cardo bold 14px, top-left. Colour adapts to the
            corner's lightness (dark ink on light, white on dark); the drop
            shadow only rides the white variant, to lift it off busy imagery. */}
        {showLabel && (
          <span
            className="absolute left-5 top-[18px] font-serif text-[14px] font-bold leading-[12px]"
            style={{
              color: labelColor,
              textShadow: labelDark ? 'none' : '0 1px 3px rgba(0,0,0,0.35)',
            }}
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
