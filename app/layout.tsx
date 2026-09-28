import type { Metadata, Viewport } from 'next'
import { serif, sans } from './fonts'
import { Header } from '@/components/Header'
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/meta'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  // Without this, og:url stays relative and og:image resolves against the
  // per-deployment Vercel hostname, which stops answering on the next deploy.
  // See lib/meta.ts.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    // Pages set the specific half; this appends the masthead once, so no page
    // has to remember to.
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    type: 'website',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
}

// Phase-lock the dot grid to the card columns (profile + list grids: the 1720
// frame, 4/3/2 columns at 1024/640, gap = margin = 40, or 16 on phones).
//
// On a fixed 32px pitch from the viewport edge, the fluid columns put each
// gutter at a different phase: at 1658px wide the three gutters caught one
// dot, then two, then one off-centre. Instead the pitch flexes a hair
// (roughly 30 to 34px) so a whole number of dots spans one column + gutter,
// and the grid shifts so a dot sits dead centre in every gutter and in both
// side margins (gap = margin makes those the same lattice). Every gutter then
// reads identically at any width. Pages without columns just get a ~32px
// grid, which is all they ever showed.
//
// An inline script, not an effect: it has to land before first paint or the
// ground visibly slides into place. Keep in step with Masonry's breakpoints.
const DOT_PHASE_SCRIPT = `(function(){
  var r=document.documentElement;
  function set(){
    var w=r.clientWidth, f=Math.min(w,1720), x0=(w-f)/2;
    var cols=w>=1024?4:w>=640?3:2, m=w>=640?40:16;
    var period=(f-2*m+m)/cols, n=Math.max(1,Math.round(period/32)), p=period/n;
    r.style.setProperty('--dot-pitch',p+'px');
    r.style.setProperty('--dot-x',(x0+m/2-p/2)+'px');
  }
  set(); addEventListener('resize',set);
})()`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <head>
        {/* Before first paint, so the ground never jumps into phase. */}
        <script dangerouslySetInnerHTML={{ __html: DOT_PHASE_SCRIPT }} />
      </head>
      <body className="dot-ground text-ink">
        <Header />
        {children}
      </body>
    </html>
  )
}
