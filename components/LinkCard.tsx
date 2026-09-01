// New "Link card" — the bulletin grid's atomic unit. Spec from Figma ProjectX
// node 695:840. Built fluid: fills its grid cell (w-full) and keeps the 272×270
// proportions via aspect-ratio + percentage-positioned internals, so it works
// 2-up on mobile and 4-up at the 272px desktop width.

import { CardThumb } from '@/components/CardThumb'
import { FaviconPlate } from '@/components/FaviconPlate'

interface LinkCardProps {
  url: string
  title: string
  image: string | null
  // The next candidate to try if `image` fails to load (a broken/404 og drops
  // to the captured screenshot before the plate). Omit for a single static image.
  fallbackImage?: string | null
  faviconUrl?: string | null
  // First-row cards on the home showcase load eagerly for LCP; the rest lazy-load.
  priority?: boolean
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function LinkCard({ url, title, image, fallbackImage, faviconUrl, priority = false }: LinkCardProps) {
  const domain = getDomain(url)
  const candidates = [image, fallbackImage].filter((s): s is string => !!s)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className="relative block aspect-[272/270] w-full overflow-hidden rounded-[20px] bg-card ring-1 ring-black/[0.03] card-lift"
    >
      {/* thumbnail — 67.6% wide, 184:118, at (16.2%, 21.9%) */}
      <div className="absolute left-[16.2%] top-[21.9%] aspect-[184/118] w-[67.6%] overflow-hidden rounded-[10px] bg-black/[0.06]">
        <CardThumb
          candidates={candidates}
          priority={priority}
          fallback={<FaviconPlate faviconUrl={faviconUrl} domain={domain} />}
        />
      </div>

      {/* title — Mier A bold, left-aligned to the thumbnail, 2 lines */}
      <h3 className="absolute left-[16.2%] top-[69%] line-clamp-2 w-[67.6%] font-sans text-[12px] font-bold leading-[13px] text-ink">
        {title}
      </h3>
    </a>
  )
}
