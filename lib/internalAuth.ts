import { createHash, timingSafeEqual } from 'crypto'
import { SITE_URL } from '@/lib/meta'

// Server-to-server auth for routes only our own code should call (the
// screenshot capture, which spends ScreenshotOne credit and writes with the
// service role). The token is derived from the service-role key, so it exists
// wherever that key does (Vercel and .env.local) with no extra env var, and it
// never leaves the server.
//
// Callers send `internalHeaders()`; the route checks `isInternalRequest(req)`.

const HEADER = 'x-bulletin-internal'

function token(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return null
  return createHash('sha256').update(`bulletin-internal:${key}`).digest('hex')
}

export function internalHeaders(): Record<string, string> {
  const t = token()
  return t ? { [HEADER]: t } : {}
}

// Where to send an internal call. In production, always our own canonical host,
// never the incoming request's Host header, so the token can't be steered to a
// spoofed origin. Previews and dev call themselves.
export function internalOrigin(requestOrigin: string): string {
  return process.env.VERCEL_ENV === 'production' ? SITE_URL : requestOrigin
}

export function isInternalRequest(req: Request): boolean {
  const expected = token()
  const given = req.headers.get(HEADER)
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
