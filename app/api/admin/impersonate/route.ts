import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'

// Founder-only: sign in as a seeded PREVIEW persona to curate its page before
// outreach. GET /api/admin/impersonate?u=preview-x&key=<ADMIN_PREVIEW_KEY> —
// mints a magic link server-side and redirects into it.
//
// Two hard limits keep the blast radius at "someone could edit a preview":
// the key gates every request, and the target must be is_preview = true, so
// this can never sign in as a real user — including a preview that has been
// claimed (claiming clears the flag).
//
// Answers 404, not 403, on any failure: an unauthenticated probe learns
// nothing about which usernames or keys exist.

export const dynamic = 'force-dynamic'

function keyOk(given: string): boolean {
  const expected = process.env.ADMIN_PREVIEW_KEY
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || ''
  if (!keyOk(req.nextUrl.searchParams.get('key') || '')) return new NextResponse('not found', { status: 404 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_preview')
    .eq('username', u)
    .maybeSingle()
  if (!profile?.is_preview) return new NextResponse('not found', { status: 404 })

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: `${u}@seed.bulletin.local`,
  })
  const link = data?.properties?.action_link
  if (error || !link) return new NextResponse('link error', { status: 500 })
  return NextResponse.redirect(link)
}
