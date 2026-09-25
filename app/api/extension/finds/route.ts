import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DISPLAY_BULLET_COLS, mapDisplayBullet } from '@/lib/displayBullet'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''

  if (!token) {
    return json({ error: 'missing bearer token' }, 401)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token)

  if (userErr || !user) {
    return json({ error: 'invalid or expired token' }, 401)
  }

  // Get query params
  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100)
  const offset = parseInt(url.searchParams.get('offset') || '0')

  // The iOS app reads `username` off this call at sign-in to tell an account
  // with a page from one that still needs setup (null = no page yet), so the
  // handle rides along with every page of finds.
  const [{ data: bookmarks, error: fetchErr, count }, { data: prof }] = await Promise.all([
    supabase
      .from('bookmarks')
      .select(`${DISPLAY_BULLET_COLS}, list_bookmarks(lists(name, slug))`, { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    supabase.from('profiles').select('username').eq('id', user.id).maybeSingle(),
  ])

  if (fetchErr) {
    return json({ error: fetchErr.message }, 400)
  }

  const finds = (bookmarks || []).map(mapDisplayBullet)

  return json({
    ok: true,
    finds,
    total: count || 0,
    username: prof?.username ?? null,
    limit,
    offset,
  })
}
