import type { Metadata } from 'next'
import { Header } from '@/components/Header'
import './globals.css'

export const metadata: Metadata = {
  title: 'leaving this here',
  description: 'Your bookmarks, out loud.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-white">
        <Header />
        {children}
      </body>
    </html>
  )
}
