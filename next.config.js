/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Optimized thumbnails are stable — a card's screenshot/og image rarely
    // changes once captured. Default TTL is 60s, which re-optimizes the same
    // ~1000 images over and over as you scroll (slow + burns Vercel image
    // transforms). Cache each optimized thumb for 31 days instead.
    minimumCacheTTL: 60 * 60 * 24 * 31,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
}

module.exports = nextConfig
