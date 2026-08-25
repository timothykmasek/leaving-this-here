import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/meta'

// There was no robots.txt. The request fell through to /[username], which
// treated "robots.txt" as a username, found no such person, and returned the
// profile shell with HTTP 200 — a page titled "robots.txt · Bulletin" that
// crawlers were free to index.
//
// Disallows are the routes that are real but have no business in an index:
// the API, the fixture previews, and the signed-in-only flows, which show a
// crawler nothing but a redirect anyway.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/preview/', '/import', '/setup', '/start', '/login'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
