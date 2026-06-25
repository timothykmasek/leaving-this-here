// New "Link card" — the bulletin grid's atomic unit. Spec from Figma ProjectX
// node 695:840. Built fluid: fills its grid cell (w-full) and keeps the 272×270
// proportions via aspect-ratio + percentage-positioned internals, so it works
// 2-up on mobile and 4-up at the 272px desktop width.

import Image from 'next/image'

interface LinkCardProps {
  url: string
  title: string
  image: string | null
  listName?: string | null
  // First-row cards on the home showcase load eagerly for LCP; the rest lazy-load.
  priority?: boolean
}

// One corner rivet (the bulletin-board "pin" dots) — ~8px, inset ~7.4%.
function Rivet({ className }: { className: string }) {
  return (
    <span aria-hidden className={`absolute h-[7px] w-[7px] rounded-full bg-[#d9d9d9] ${className}`} />
  )
}

export function LinkCard({ url, title, image, listName, priority = false }: LinkCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative block aspect-[272/270] w-full overflow-hidden rounded-[20px] bg-card shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition-shadow hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)]"
    >
      {/* corner rivets */}
      <Rivet className="left-[7.4%] top-[7.4%]" />
      <Rivet className="right-[7.4%] top-[7.4%]" />
      <Rivet className="bottom-[7.4%] left-[7.4%]" />
      <Rivet className="bottom-[7.4%] right-[7.4%]" />

      {/* thumbnail — 67.6% wide, 184:118, at (16.2%, 21.9%) */}
      <div className="absolute left-[16.2%] top-[21.9%] aspect-[184/118] w-[67.6%] overflow-hidden rounded-[10px] bg-black/[0.06]">
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="(min-width: 1024px) 184px, 25vw"
            className="object-cover"
            priority={priority}
          />
        ) : null}
      </div>

      {/* title — Cardo bold, left-aligned to the thumbnail, 2 lines */}
      <h3 className="absolute left-[16.2%] top-[69%] line-clamp-2 w-[67.6%] font-serif text-[12px] font-bold leading-[13px] text-ink">
        {title}
      </h3>

      {/* list tag — bracketed pill, centered, near bottom */}
      {listName ? (
        <div className="absolute bottom-[5.5%] left-1/2 max-w-[88%] -translate-x-1/2">
          <span className="label inline-flex items-center gap-[7px] whitespace-nowrap rounded-full bg-black/[0.06] px-[11px] py-[4px] text-ink">
            <span aria-hidden className="text-black/40">[</span>
            {listName}
            <span aria-hidden className="text-black/40">]</span>
          </span>
        </div>
      ) : null}
    </a>
  )
}
