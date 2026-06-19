// New "Link card" — the bulletin grid's atomic unit. Pixel spec from Figma
// ProjectX node 695:840 (exact metadata): 272×270 #f1f1f1 panel, 4 corner
// rivets (8px, inset 20), inset rounded thumbnail (184×118 @ 44,59),
// Cardo-bold title (@ 44,186), Routed-Gothic-Wide tag in a bracketed pill.
//
// Pure presentational props so it can be driven by mock data (preview) or real
// bookmark rows (later integration into BookmarkCard/profile).

interface LinkCardProps {
  url: string
  title: string
  image: string | null
  listName?: string | null
}

// One corner rivet (the bulletin-board "pin" dots) — 8px, inset 20px.
function Rivet({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`absolute h-[8px] w-[8px] rounded-full bg-black/20 ${className}`}
    />
  )
}

export function LinkCard({ url, title, image, listName }: LinkCardProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative block h-[270px] w-[272px] overflow-hidden rounded-[20px] bg-card shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition-shadow hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)]"
    >
      {/* corner rivets */}
      <Rivet className="left-[20px] top-[20px]" />
      <Rivet className="right-[20px] top-[20px]" />
      <Rivet className="bottom-[20px] left-[20px]" />
      <Rivet className="bottom-[20px] right-[20px]" />

      {/* thumbnail — 184×118 @ (44,59) */}
      <div className="absolute left-[44px] top-[59px] h-[118px] w-[184px] overflow-hidden rounded-[10px] bg-black/[0.06]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>

      {/* title — Cardo bold 12px, left-aligned to thumbnail, 2 lines @ (44,186) */}
      <h3 className="absolute left-[44px] top-[186px] line-clamp-2 w-[184px] font-serif text-[12px] font-bold leading-[13px] text-ink">
        {title}
      </h3>

      {/* list tag — bracketed pill, centered, bottom (flanked by bottom rivets) */}
      {listName ? (
        <div className="absolute bottom-[16px] left-1/2 -translate-x-1/2">
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
