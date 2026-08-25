// A list's description, cleaned for display.
//
// Descriptions arrive from a few places — typed, generated, pasted out of a
// notes app — and some carry a markdown heading that repeats the list's own
// name:
//
//   "# Ecommerce Sites\n\nA curated collection of direct-to-consumer brands…"
//
// Rendered as-is, the page says "Ecommerce Sites" in the cover, then
// "# Ecommerce Sites" again immediately underneath, hash and all. The hash is
// never meaningful here: nothing renders markdown on this page, and the title
// it duplicates is already the largest thing on screen.
//
// Cleaned at RENDER, not by a migration — the same choice lib/cardTitle makes.
// The stored text stays exactly as the owner wrote it, so nothing is lost and
// editing shows them their own words rather than our tidied version.

/** Strip a leading markdown heading and any blank line it left behind. */
export function cleanListDescription(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw
    .replace(/\r/g, '')
    // Only a heading at the very START. One further in is doing some work —
    // separating sections — and removing it would change what was written.
    .replace(/^\s*#{1,6}[ \t]+[^\n]*(?:\n|$)/, '')
    .trim()
  return cleaned || null
}
