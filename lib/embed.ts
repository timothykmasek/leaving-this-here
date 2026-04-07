// Thin wrapper around Voyage AI's embeddings API.
// https://docs.voyageai.com/reference/embeddings-api
//
// We use `voyage-3-lite` — 1024 dims, fast, very cheap. Good enough for
// bookmark-sized text (title + description + domain + tags).
//
// `input_type: 'document'` is for indexing, `'query'` is for search queries.
// Voyage recommends this split because it gives noticeably better recall.

const VOYAGE_MODEL = 'voyage-3-lite'
const VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/embeddings'

export type EmbedInputType = 'document' | 'query'

export async function embed(
  texts: string[],
  inputType: EmbedInputType
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY is not set')
  }

  const res = await fetch(VOYAGE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: texts,
      model: VOYAGE_MODEL,
      input_type: inputType,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`voyage embed failed (${res.status}): ${detail}`)
  }

  const data = await res.json()
  // Voyage returns { data: [{ embedding: number[], index: number }, ...] }
  // — sort by index so we match the input order.
  const sorted = [...(data.data || [])].sort((a: any, b: any) => a.index - b.index)
  return sorted.map((d: any) => d.embedding as number[])
}

// Build the string we embed for a bookmark. Kept in one place so backfill
// and save-path produce identical text.
export function bookmarkToEmbedText(b: {
  title?: string | null
  description?: string | null
  url?: string | null
  tags?: string[] | null
}): string {
  let host = ''
  try { if (b.url) host = new URL(b.url).hostname } catch {}
  return [
    b.title || '',
    b.description || '',
    host,
    ...(b.tags || []),
  ]
    .filter(Boolean)
    .join(' — ')
    .slice(0, 2000) // hard cap to keep token counts predictable
}
