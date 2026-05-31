// A small, original line-drawn gem (brilliant, side view) — thin engraved
// strokes in currentColor. Used in the wordmark and as a quiet hero motif.
export function GemGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      {/* outline: table → crown → girdle → pavilion point */}
      <path d="M9 5 H19 L24 11 L14 24 L4 11 Z" />
      {/* girdle */}
      <path d="M4 11 H24" />
      {/* crown facets */}
      <path d="M9 5 L11 11 M19 5 L17 11" />
      {/* pavilion facets */}
      <path d="M11 11 L14 24 M17 11 L14 24 M14 11 V24" />
    </svg>
  )
}
