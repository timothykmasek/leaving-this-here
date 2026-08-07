// Small vector helpers shared by the semantic-ranking routes (the list-page
// "ambient shelf" and the extension's list ranker). One home for the math so the
// two callers can't drift apart on how a centroid is built or cosine is scored.
//
// All embeddings here are Voyage 512-dim float arrays; see lib/embed.ts.

export type Vec = number[]

// Embeddings come back from Postgres either as a JS array (json) or as a pgvector
// string literal "[0.1,0.2,...]" depending on the column/driver path. Accept both;
// anything else → null (caller skips it).
export function parseVec(e: unknown): Vec | null {
  if (Array.isArray(e)) return e as Vec
  if (typeof e === 'string') {
    try {
      const v = JSON.parse(e)
      return Array.isArray(v) ? v : null
    } catch {
      return null
    }
  }
  return null
}

export function normalize(v: Vec): Vec {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}

export function dot(a: Vec, b: Vec): number {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

// Cosine similarity, robust to un-normalized inputs and mismatched/empty vectors
// (which score 0 and are effectively skipped).
export function cosine(a: Vec, b: Vec): number {
  if (!a.length || !b.length) return 0
  const na = Math.sqrt(dot(a, a))
  const nb = Math.sqrt(dot(b, b))
  if (na === 0 || nb === 0) return 0
  return dot(a, b) / na / nb
}

// Mean direction of a set of vectors, unit-normalized. Empty set → null.
// Normalizing folds the /len in, so magnitude (which shrinks as members cancel)
// doesn't distort downstream cosine scores.
export function centroid(vecs: Vec[]): Vec | null {
  if (!vecs.length) return null
  const dim = vecs[0].length
  const sum = new Array(dim).fill(0)
  for (const v of vecs) {
    const n = Math.min(dim, v.length)
    for (let i = 0; i < n; i++) sum[i] += v[i]
  }
  return normalize(sum)
}
