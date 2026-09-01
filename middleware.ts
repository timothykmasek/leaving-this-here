import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Next fires <Link> prefetches (on hover / viewport entry) through middleware
  // too. A prefetch never needs a fresh session-cookie write and never renders a
  // protected redirect, so skip the getUser() network validation for it: this
  // avoids 2-4x'ing Supabase Auth traffic for pages the user never opens, and
  // stops concurrent prefetches from racing to rotate the single-use refresh
  // token (itself a silent-logout risk). Only genuine prefetches carry the
  // `next-router-prefetch` header — ordinary client navigations send RSC/_rsc but
  // NOT this header, so they still hit the validation + cookie-refresh path below.
  // Genuine prefetches carry `next-router-prefetch` (Next's canonical middleware
  // signal on Vercel) or `purpose: prefetch`. Ordinary client navigations carry
  // neither — they send RSC/next-url instead — so this never skips auth on a real
  // navigation; worst case a prefetch isn't recognized and just pays the old cost.
  const isPrefetch =
    request.headers.has('next-router-prefetch') ||
    request.headers.get('purpose') === 'prefetch'
  if (isPrefetch) return response

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({
            request: { headers: request.headers },
          })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No route protection here anymore — /bookmarklet and /setup (the last
  // protected paths) were removed 2026-08-29; next.config redirects them to
  // /start. The middleware still runs everywhere for the cookie refresh above.
  void user

  return response
}

export const config = {
  // Run on every page route so the session is refreshed and Supabase's rotated
  // auth cookies get written back on navigation. Middleware is the ONLY place
  // Next lets us persist those cookies (server components can't — see
  // lib/supabase/server.ts), so scoping this to a couple of paths left the
  // browser holding a stale, single-use refresh token that died on the next
  // call — a silent logout. Static assets and API routes (bearer-auth /
  // self-persisting) are skipped.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
}
