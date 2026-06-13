import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'

// POST /api/generate-list-description
// Generate a description for a list using Haiku. Authenticated only.

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const bio = typeof body.bio === 'string' ? body.bio.slice(0, 200) : ''
  const listName = typeof body.listName === 'string' ? body.listName.slice(0, 100) : ''

  if (!listName) {
    return NextResponse.json({ error: 'listName required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ description: null })

  const prompt = bio
    ? `The user "${bio}" created a list called "${listName}". Write one brief sentence describing what this list might contain or its purpose. Keep it under 100 characters. Be specific and conversational, not generic.`
    : `Someone created a list called "${listName}". Write one brief sentence describing what this list might contain. Keep it under 100 characters. Be specific and conversational.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 80,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return NextResponse.json({ description: null })
    const data = await res.json()
    const description: string = data?.content?.[0]?.text || ''
    return NextResponse.json({
      description: description.trim().slice(0, 200) || null,
    })
  } catch {
    return NextResponse.json({ description: null })
  }
}
