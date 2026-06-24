import { NextRequest, NextResponse } from 'next/server'

// POST /api/onboarding/react
//
// Haiku-in-the-loop for the onboarding chat: given the question just answered,
// returns a one-line acknowledgment and (when the question chains one) the
// follow-up phrased around the user's actual answer.
//
// This endpoint is ANONYMOUS (the whole flow runs before an account exists),
// which makes it an abuse surface. Defenses: per-IP rate limit, tiny
// max_tokens, and the client always has scripted fallbacks — a 429 or timeout
// here costs nothing but warmth.

// Best-effort in-memory limiter (per serverless instance). Good enough to
// blunt loops; the scripted fallback means legit users never notice a 429.
const hits = new Map<string, { n: number; t: number }>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 12

function limited(ip: string): boolean {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || now - h.t > WINDOW_MS) {
    hits.set(ip, { n: 1, t: now })
    return false
  }
  h.n++
  return h.n > MAX_PER_WINDOW
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (limited(ip)) return NextResponse.json({ error: 'slow down' }, { status: 429 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const question = typeof body.question === 'string' ? body.question.slice(0, 300) : ''
  const answer = typeof body.answer === 'string' ? body.answer.slice(0, 500) : ''
  const followUpTemplate =
    typeof body.follow_up === 'string' ? body.follow_up.slice(0, 300) : null
  if (!question || !answer) {
    return NextResponse.json({ error: 'question and answer required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ ack: null, followUp: null })

  const prompt = followUpTemplate
    ? `You are the warm, genuine voice of Bulletin — a product where people ` +
      `collect and share links they care about. During onboarding you asked:\n"${question}"\n\n` +
      `They answered:\n"${answer}"\n\n` +
      `Reply with EXACTLY two lines:\n` +
      `Line 1 — a brief, specific acknowledgment that shows you heard them (2-6 words, ` +
      `lowercase ok, no exclamation marks, reference something concrete from their ` +
      `answer, never generic like "that's cool" or "interesting").\n` +
      `Line 2 — a natural follow-up that shows curiosity about THEIR specific answer. ` +
      `The template is: "${followUpTemplate}" — but rephrase it to feel like you're ` +
      `actually asking them about what they just told you. One sentence, conversational. ` +
      `If they already gave you a link/resource in their answer, skip the follow-up ` +
      `and just return their acknowledgment.\n` +
      `No quotes, no preamble.`
    : `You are the warm, genuine voice of Bulletin — a product where people ` +
      `collect and share links they care about. During onboarding you asked:\n"${question}"\n\n` +
      `They answered:\n"${answer}"\n\n` +
      `Reply with ONE brief, specific acknowledgment (2-6 words, lowercase ok, no ` +
      `exclamation marks, reference something concrete from their answer, never generic). ` +
      `No quotes.`

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
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      }),
      // The client falls back to scripted copy after ~2s anyway; don't let a
      // slow call hold a serverless instance.
      signal: AbortSignal.timeout(3500),
    })
    if (!res.ok) return NextResponse.json({ ack: null, followUp: null })
    const data = await res.json()
    const raw: string = data?.content?.[0]?.text || ''
    const lines = raw
      .split('\n')
      .map((l: string) => l.trim().replace(/^["'“”]+|["'“”]+$/g, ''))
      .filter(Boolean)
    return NextResponse.json({
      ack: lines[0]?.slice(0, 120) || null,
      followUp: followUpTemplate ? lines[1]?.slice(0, 220) || null : null,
    })
  } catch {
    return NextResponse.json({ ack: null, followUp: null })
  }
}
