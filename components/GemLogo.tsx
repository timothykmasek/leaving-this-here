type Props = {
  size?: number
  className?: string
  // Two-tone gem: `fill` is the lighter top facet, `stroke` is the body outline
  // and darker side facets. Defaults read nicely on white.
  fill?: string
  stroke?: string
}

// Minimal hand-rolled gem mark. Six-sided cut-stone silhouette with two
// internal facet lines so it reads as a gem at 14px and still feels crafted
// at 96px+. Pure SVG, no external deps.
export function GemLogo({
  size = 20,
  className,
  fill = '#bfe7ff',
  stroke = '#0f172a',
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Outer silhouette */}
      <path
        d="M6 4h12l4 6-10 12L2 10l4-6z"
        fill={fill}
        stroke={stroke}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* Top facet line */}
      <path
        d="M2 10h20"
        stroke={stroke}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Inner V — gives the cut-stone feel */}
      <path
        d="M9 10l3 12 3-12"
        stroke={stroke}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* Top-edge faceting */}
      <path
        d="M6 4l3 6 3-6 3 6 3-6"
        stroke={stroke}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}
