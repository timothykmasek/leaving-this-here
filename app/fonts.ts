import localFont from 'next/font/local'

// ── Brand type system (rebrand) ────────────────────────────────────────────
// Spec pulled from Figma "ProjectX" (node 695:856). Three families, three jobs.

// MOCA Black — high-contrast display serif. Wordmark + hero headlines only.
// ⚠️ TRIAL LICENSE: this is an EDITO evaluation copy (`Moca-Black-Trial`).
// Purchase the EDITO web license before any production deploy. See app/fonts/.
export const display = localFont({
  src: [{ path: './fonts/Moca-Black.woff2', weight: '900', style: 'normal' }],
  display: 'swap',
  variable: '--font-display',
})

// Cardo — scholarly book serif (OFL, ship-safe). Item titles + reading body.
export const serif = localFont({
  src: [
    { path: './fonts/Cardo-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Cardo-Italic.woff2', weight: '400', style: 'italic' },
    { path: './fonts/Cardo-Bold.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-serif',
})

// Routed Gothic Wide — technical engineering-stencil (public domain, ship-safe).
// Every UI label: uppercase, 10px, 1.5px tracking. See the `.label` utility.
export const label = localFont({
  src: [
    { path: './fonts/RoutedGothicWide-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/RoutedGothicWide-Italic.woff2', weight: '400', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-label',
})
