import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

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

  // Protect these routes — redirect to login if not signed in.
  // NOTE: /save and /bookmarklet are intentionally NOT protected.
  //   - /save needs to preserve the ?url= and ?title= query params that the
  //     bookmarklet sends; a middleware redirect would lose them. The page
  //     handles the signed-out state itself with a "Sign in first" message.
  //   - /bookmarklet is a public setup/helper page so prospective users can
  //     preview how saving works before signing up.
  const protectedPaths = ['/discover', '/setup']
  if (protectedPaths.includes(request.nextUrl.pathname) && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/discover', '/setup'],
}
