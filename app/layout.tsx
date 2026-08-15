import type { Metadata, Viewport } from 'next'
import { display, serif, label, sans } from './fonts'
import { Header } from '@/components/Header'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export const metadata: Metadata = {
  title: 'Bulletin',
  description: 'Save the links worth keeping.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${display.variable} ${serif.variable} ${label.variable} ${sans.variable}`}>
      <body className="dot-ground text-ink">
        <Header />
        {children}
      </body>
    </html>
  )
}
