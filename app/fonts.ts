import localFont from 'next/font/local'

// ── Brand type system (Figma "ProjectX" Text Styles) ────────────────────────
// Two type families do all the work (the "Bulletin" wordmark is an image, not a
// font). MOCA (display serif) and Routed Gothic (labels) were retired 2026-08-15
// when the type system consolidated onto Mier A.
//   • Mier A  → Headline (Book) + Body (Book) + all UI labels
//   • Cardo   → Editorial only (bios, taglines, quotes, the card list line)
//
// Headlines are Book 400, NOT DemiBold — corrected 2026-08-18. The v3 homepage
// hero (app/page.tsx) is 400 at 40px and sets the direction; /start was left on
// font-bold 700 from before the Aug-15 consolidation and read far too heavy next
// to it. If a headline here looks "too light", that's the intended editorial
// voice — don't quietly bump it back to 600/700.

// Mier A — neo-grotesque (licensed; provided by Tim, self-hosted woff2). The
// interface workhorse. Numeric weights map to the family's named cuts so
// `font-weight` selects the file: Book 400 (headlines + body), Regular 500, DemiBold 600,
// Bold 700 (font-bold headings), Black 900 (emphasis / former labels).
export const sans = localFont({
  src: [
    { path: './fonts/MierA-Book.woff2', weight: '400', style: 'normal' },
    { path: './fonts/MierA-Regular.woff2', weight: '500', style: 'normal' },
    { path: './fonts/MierA-DemiBold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/MierA-Bold.woff2', weight: '700', style: 'normal' },
    { path: './fonts/MierA-Black.woff2', weight: '900', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-sans',
})

// Cardo — scholarly book serif (OFL, ship-safe). Editorial role only: bios,
// taglines, pull quotes, list titles, the card list line.
export const serif = localFont({
  src: [
    { path: './fonts/Cardo-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Cardo-Italic.woff2', weight: '400', style: 'italic' },
    { path: './fonts/Cardo-Bold.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-serif',
})
