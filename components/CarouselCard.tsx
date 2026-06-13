import { GemGlyph } from '@/components/GemGlyph'
import { pickCardImage } from '@/lib/cardImage'

// Fixed-size card for the homepage carousel — uniform 4:3 image (object-cover)
// + a fixed-height title/domain footer, so every card is identical regardless
// of source (screenshot vs og-image vs none).

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function CarouselCard({ b }: { b: any }) {
  const domain = domainOf(b.url)
  const title = b.title?.trim() || domain
  const img = pickCardImage(b.url, b.image_url, b.screenshot_url)

  return (
    <a
      href={b.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-none border border-[#26221c]/30 bg-stone-50 shadow-[0_1px_3px_rgba(40,30,25,0.08)] transition-colors hover:border-[#26221c]/60"
    >
      <div className="aspect-[4/3] overflow-hidden bg-[#ece6d8]">
        {img ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={img} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <GemGlyph className="h-8 w-8 text-ink/20" />
          </div>
        )}
      </div>
      <div className="px-4 pb-3.5 pt-3">
        <h3 className="line-clamp-2 min-h-[2.6em] font-serif text-[15px] leading-snug tracking-tight text-ink">
          {title}
        </h3>
        <p className="mt-1.5 font-serif text-[10px] uppercase tracking-[0.13em] text-stone-500">{domain}</p>
      </div>
    </a>
  )
}
