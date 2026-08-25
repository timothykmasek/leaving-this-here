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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body className="dot-ground text-ink">
        <Header />
        {children}
      </body>
    </html>
  )
}
