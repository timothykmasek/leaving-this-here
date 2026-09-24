import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'

// Export every bullet the signed-in account has saved, as a CSV that /import
// (or Pocket, Raindrop, a spreadsheet) reads straight back. Your links are
// yours: one click, no email-me-a-zip.
//
// Reads through the cookie session, so RLS scopes it to the caller's own rows.
// Paged past PostgREST's 1000-row cap.

export const dynamic = 'force-dynamic'

const PAGE = 1000

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET() {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const rows: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('url, title, description, created_at, list_bookmarks(lists(name))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) return NextResponse.json({ error: 'Export failed' }, { status: 500 })
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }

  const lines = [
    'url,title,description,lists,saved_at',
    ...rows.map((b) =>
      [
        b.url,
        b.title,
        b.description,
        (b.list_bookmarks || [])
          .map((m: any) => m.lists?.name)
          .filter(Boolean)
          .join('; '),
        b.created_at,
      ]
        .map(cell)
        .join(','),
    ),
  ]

  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bulletin-links-${date}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
