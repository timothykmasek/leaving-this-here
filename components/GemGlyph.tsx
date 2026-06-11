// Brand mark for "according to" — an opening quotation mark (citation motif),
// filled in currentColor. Named GemGlyph for historical reasons (it predates the
// rename and is imported in a few places); the drawing is now a quote mark, not
// a gem. Used in the wordmark and as a quiet hero motif.
export function GemGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      {/* left mark — ball with a tail sweeping up (opening quote) */}
      <circle cx="9" cy="15" r="3" />
      <path d="M6.2 13.8 Q 7 8 11 7.5 Q 9.2 10.6 9.2 14 Z" />
      {/* right mark */}
      <circle cx="18" cy="15" r="3" />
      <path d="M15.2 13.8 Q 16 8 20 7.5 Q 18.2 10.6 18.2 14 Z" />
    </svg>
  )
}
