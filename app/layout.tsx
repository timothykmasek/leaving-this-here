import type { Metadata, Viewport } from 'next'
import { Newsreader } from 'next/font/google'
import { Header } from '@/components/Header'
import './globals.css'

// Warm mid-century book serif for headers + small-caps labels — the vintage
// gem-plate / textbook voice (cozy, readable, lovely italics).
const display = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'according to',
  description: 'Save the links worth keeping.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={display.variable}>
      <body className="bg-paper text-ink">
        <Header />
        {children}
      </body>
    </html>
  )
}
