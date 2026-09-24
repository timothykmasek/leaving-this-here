import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { RESERVED_HANDLES } from '@/lib/reservedHandles'

// GET /api/username-check?u=<handle>
//
// Anonymous availability check for the homepage claim field. Returns
// { available: boolean, reason?: 'taken' | 'reserved' | 'invalid' }.
// This is advisory — the real reservation happens at account creation
// (/api/onboarding/setup re-checks before inserting the profile).

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('u') || ''
  const u = raw.trim().toLowerCase()

  if (!u || u.length > 30 || !/^[a-z0-9-]+$/.test(u)) {
    return NextResponse.json({ available: false, reason: 'invalid' })
  }
  if (RESERVED_HANDLES.has(u)) {
    return NextResponse.json({ available: false, reason: 'reserved' })
  }

  // Anon client is enough — profiles are publicly readable (public pages).
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
  const { data, error } = await supabase
    .from('profiles')
    .select('username')
    .eq('username', u)
    .maybeSingle()

  if (error) {
    // Fail open as "unknown" rather than blocking the flow; the authoritative
    // check at profile insert still enforces uniqueness.
    return NextResponse.json({ available: true, reason: 'unverified' })
  }
  return NextResponse.json(
    data ? { available: false, reason: 'taken' } : { available: true }
  )
}
