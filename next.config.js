/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Serve card images straight from their source (Supabase Storage CDN /
    // remote og hosts) instead of routing every one through Vercel's Image
    // Optimization. Card screenshots are captured once and never change, and
    // they're pre-shrunk to ~1280px webp at save/backfill time — so on-the-fly
    // optimization added latency and, once the account hit its optimization
    // quota, returned 402s that rendered as blank cards. `unoptimized` removes
    // that dependency entirely: no per-request optimizer, no quota wall.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  // The Claude connector URL people paste is yourbulletin.com/mcp — a rewrite,
  // not a redirect, because MCP clients POST and some won't replay a POST
  // through a 3xx. The route itself lives at app/api/mcp.
  async rewrites() {
    return [{ source: '/mcp', destination: '/api/mcp' }]
  },
  // /setup and /bookmarklet were orphaned legacy from before extension-only
  // saving (flagged for cleanup in 0e6b698, removed 2026-08-29). Old links and
  // crawlers land on onboarding instead of a 404.
  async redirects() {
    return [
      { source: '/setup', destination: '/start', permanent: true },
      { source: '/bookmarklet', destination: '/start', permanent: true },
    ]
  },
}

module.exports = nextConfig
