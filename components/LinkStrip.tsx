// The contact-sheet band of a list's link images — a row of thumbs at one
// shared height, each keeping its own aspect, overrunning its container on both
// sides and dissolving into the surface behind it.
//
// Shared by the CollectionCard (where it IS the card's identity) and the list
// page's default cover, which is the same asset at masthead scale. They were
// always meant to read as one thing; keeping two copies of the geometry is how
// they'd stop.
//
// The caller positions the band — it's absolutely placed in both uses — and
// owns the clipping, since the whole effect depends on overflowing a parent
// with overflow-hidden.

const DEFAULT_FADE_W = '15.25%' // 45/295 on the card plate

export function LinkStrip({
  thumbs,
  className = '',
  style,
  /** Cap on one tile's width, as a % of the container. This is the knob that
   *  sets how many tiles you SEE: visible ≈ 100/cap whenever tiles clamp to it,
   *  which for Bulletin's landscape-heavy card images is most of the time. */
  thumbMaxWidth = '35%',
  fadeWidth = DEFAULT_FADE_W,
  /** The surface the band dissolves into. Faded to an alpha-0 version of ITSELF
   *  rather than `transparent`, which is transparent *black* and risks a grey
   *  cast mid-ramp. */
  fadeColor = '#F1F1F1',
  fadeColorTransparent = 'rgba(241,241,241,0)',
}: {
  thumbs: string[]
  className?: string
  style?: React.CSSProperties
  thumbMaxWidth?: string
  fadeWidth?: string
  fadeColor?: string
  fadeColorTransparent?: string
}) {
  if (!thumbs.length) return null
  return (
    // Centred so it bleeds symmetrically, which is the rule that holds for any
    // number of tiles of any widths.
    <div className={`flex justify-center ${className}`} style={style}>
      {thumbs.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${src}-${i}`}
          src={src}
          alt=""
          className="h-full w-auto shrink-0 bg-black/[0.04] object-cover"
          style={{ maxWidth: thumbMaxWidth }}
        />
      ))}

      <span
        aria-hidden
        className="absolute inset-y-0 left-0"
        style={{
          width: fadeWidth,
          background: `linear-gradient(90deg, ${fadeColor} 0%, ${fadeColorTransparent} 100%)`,
        }}
      />
      <span
        aria-hidden
        className="absolute inset-y-0 right-0"
        style={{
          width: fadeWidth,
          background: `linear-gradient(270deg, ${fadeColor} 0%, ${fadeColorTransparent} 100%)`,
        }}
      />
    </div>
  )
}
