// Generate embed-only English search keywords for a bookmark with Claude Haiku.
//
// Why this exists: search embeds title + description + hostname. A one-word
// English query ("hat") scored only 0.22 against a French product title
// ("Chapeau Isaho…") — voyage-3-lite doesn't bridge "hat" → "chapeau", and the
// client substring fallback can't match "hat" inside "chapeau". By appending a
// compact line of English keywords (object type, category, synonyms, translated
// foreign nouns, brand) to the embedded text, real matches clear the 0.4 gate.
//
// These keywords are a SEARCH signal only — stored in bookmarks.keywords and
// folded into bookmarkToEmbedText, never rendered in the UI. Small factual
// slips (a misspelled author, a stray adjective) are harmless: they only ever
// nudge recall.

const KEYWORD_MODEL = 'claude-haiku-4-5'

function buildPrompt(b: { title?: string | null; description?: string | null; url?: string | null }): string {
  let host = ''
  try {
    if (b.url) host = new URL(b.url).hostname.replace(/^www\./, '')
  } catch {}
  const context = [
    b.title && `Title: ${b.title}`,
    b.description && `Description: ${b.description}`,
    host && `Source: ${host}`,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    `You generate compact English SEARCH KEYWORDS for a saved bookmark, to ` +
    `improve semantic search recall. Include: the concrete object/product ` +
    `type, its category, and common synonyms — INCLUDING English terms even ` +
    `when the page is in another language (translate foreign product nouns to ` +
    `English, e.g. "chapeau" → "hat"). Also include brand or notable proper ` +
    `nouns.\n\n` +
    `Bookmark:\n${context}\n\n` +
    `Reply with ONLY a single line of 5-12 lowercase keywords/short phrases, ` +
    `comma-separated. No explanation, no numbering, no quotes.`
  )
}

// Normalize Haiku's reply into a clean, bounded keyword string. Collapses to a
// single comma-separated line, dedupes, strips stray markup, and caps length so
// it can't dominate the 2000-char embed budget.
function cleanKeywords(raw: string): string {
  const seen = new Set<string>()
  const parts = raw
    .replace(/\s+/g, ' ')
    .split(',')
    .map((p) =>
      p
        .trim()
        .replace(/^[-*\d.)\s]+/, '')
        .replace(/^["'“”]+|["'“”.]+$/g, '')
        .toLowerCase()
        .trim()
    )
    .filter((p) => {
      if (!p || p.length > 40 || seen.has(p)) return false
      seen.add(p)
      return true
    })
    .slice(0, 12)
  return parts.join(', ').slice(0, 300)
}

/**
 * Return a comma-separated line of English search keywords for a bookmark, or
 * '' if enrichment is unavailable (no API key) or fails. Never throws — callers
 * treat keywords as best-effort; a missing line just leaves recall where it was.
 */
export async function enrichKeywords(b: {
  title?: string | null
  description?: string | null
  url?: string | null
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return ''
  if (!b.title && !b.description) return '' // nothing to work from

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: KEYWORD_MODEL,
        max_tokens: 120,
        messages: [{ role: 'user', content: buildPrompt(b) }],
      }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    const raw = data?.content?.[0]?.text
    return typeof raw === 'string' ? cleanKeywords(raw) : ''
  } catch {
    return ''
  }
}
