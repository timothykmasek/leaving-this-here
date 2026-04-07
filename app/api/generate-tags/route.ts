import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { url, title, description } = await req.json()

  const debug = new URL(req.url).searchParams.get('debug') === '1'
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ tags: [], ...(debug ? { reason: 'ANTHROPIC_API_KEY not set' } : {}) })
  }

  const prompt = `You are a bookmark tagging assistant. Given a saved link's URL, title, and description, return 2-4 short, lowercase tags that describe what the site IS — its category, industry, or vibe.

Good tags: "design", "brand", "dtc", "wellness", "ai", "agency", "fashion", "snacks", "beverage", "streetwear", "studio", "saas", "devtools"
Bad tags: the domain name itself, "https", "website", "online", generic words like "company" or "page"

URL: ${url}
Title: ${title || '(none)'}
Description: ${description || '(none)'}

Return ONLY a JSON array of tags, nothing else. Example: ["design", "agency", "brand"]`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({
        tags: [],
        ...(debug ? { reason: 'anthropic api error', status: res.status, detail: data } : {}),
      })
    }

    const text = data?.content?.[0]?.text || '[]'

    // Extract the JSON array from the response
    const match = text.match(/\[.*\]/)
    if (match) {
      const tags = JSON.parse(match[0])
        .filter((t: any) => typeof t === 'string')
        .map((t: string) => t.toLowerCase().trim())
        .slice(0, 5)
      return NextResponse.json({ tags })
    }

    return NextResponse.json({
      tags: [],
      ...(debug ? { reason: 'no json array in response', rawText: text.slice(0, 300) } : {}),
    })
  } catch (err: any) {
    return NextResponse.json({
      tags: [],
      ...(debug ? { reason: 'fetch threw', error: err.message || String(err) } : {}),
    })
  }
}
