import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { formatCardTitle } from '@/lib/cardTitle'
import { pickCardImage } from '@/lib/cardImage'

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

  const { data: bookmarks, error: fetchErr, count } = await supabase
    .from('bookmarks')
    .select(
      'id, url, title, description, image_url, screenshot_url, favicon_url, card_type, image_pref, created_at, site_name:raw_metadata->og->>site_name, custom_image:raw_metadata->>customImage',
      { count: 'exact' },
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (fetchErr) {
    return json({ error: fetchErr.message }, 400)
  }

  // Native clients render what this endpoint returns verbatim, so the web's
  // render-time brains run here: formatCardTitle (the `Brand — what it is`
  // voice) and pickCardImage (og vs screenshot vs custom). One implementation,
  // every client — never port these to Swift.
  const finds = (bookmarks || []).map((b: any) => ({
    id: b.id,
    url: b.url,
    title: b.title,
    image_url: b.image_url,
    favicon_url: b.favicon_url,
    created_at: b.created_at,
    display_title: formatCardTitle({
      title: b.title,
      description: b.description,
      url: b.url,
      siteName: b.site_name ?? null,
    }),
    display_image: pickCardImage(
      b.url, b.image_url, b.screenshot_url, b.card_type, b.image_pref, b.custom_image,
    ),
  }))

  return json({
    ok: true,
    finds,
    total: count || 0,
    limit,
    offset,
  })
}
