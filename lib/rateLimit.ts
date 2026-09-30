import { createClient } from '@supabase/supabase-js'

// Fixed-window rate limits for routes that spend money (Voyage, Haiku,
// ScreenshotOne, Resend). Counts live in Postgres (migration 034,
// hit_rate_limit) so they hold across serverless instances.
//
// Fails open: if the counter can't be reached (or migration 034 isn't applied
// yet), the request goes through. These are abuse brakes, not a paywall.

export async function allowRequest(key: string, max: number, windowSeconds: number): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return true
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data, error } = await admin.rpc('hit_rate_limit', {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_max: max,
    })
    if (error) return true
    return data !== false
  } catch {
    return true
  }
}

/** The caller's IP as Vercel reports it. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') || ''
  return fwd.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
}

export function tooManyRequests(headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: 'Too many requests. Try again in a minute.' }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...headers },
  })
}
