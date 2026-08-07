#!/usr/bin/env node
// backfill-keywords.mjs
//
// One-time enrichment of EXISTING bookmarks with embed-only English search
// keywords (Claude Haiku), then re-embed so the keywords fold into the vector.
// This is what lets a query like "hat" reach a French "chapeau" bookmark —
// see migrations/017_search_keywords.sql and lib/enrichKeywords.ts.
//
// PREREQ: apply migrations/017_search_keywords.sql first (adds bookmarks.keywords).
//
// Resumable + idempotent: by default only processes rows where keywords IS NULL,
// so a re-run picks up where a paced/interrupted run left off. Use --force to
// re-enrich every row.
//
// Self-paced for Voyage's FREE tier (3 RPM / 10K TPM): after each embed call it
// sleeps based on the tokens Voyage reports, staying under budget. A full ~1000
// rows takes roughly half an hour on the free key — expected, not a hang.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
// from .env.local; VOYAGE_API_KEY may live in a second file — pass it with
// `--env <path>` (e.g. a `vercel env pull` output).
//
// Usage:
//   node scripts/backfill-keywords.mjs --env /path/to/.env.voyage [--limit N]
//   node scripts/backfill-keywords.mjs --dry-run --limit 5 --env ...
//   node scripts/backfill-keywords.mjs --force --env ...

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ── args ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const opt = (name, def) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const DRY_RUN = flag('--dry-run')
const FORCE = flag('--force')
const LIMIT = opt('--limit', null) ? parseInt(opt('--limit'), 10) : null
const EXTRA_ENV = opt('--env', null)

// ── env loader (no dotenv dependency; mirrors seed.mjs) ───────────────
function loadEnv(file) {
  if (!file || !fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const k = m[1]
    const v = m[2].replace(/^["']|["']$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnv(path.join(process.cwd(), '.env.local'))
loadEnv(EXTRA_ENV)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const VOYAGE_KEY = process.env.VOYAGE_API_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local)')
  process.exit(1)
}
if (!ANTHROPIC_KEY) {
  console.error('missing ANTHROPIC_API_KEY (.env.local) — needed for keyword generation')
  process.exit(1)
}
if (!VOYAGE_KEY && !DRY_RUN) {
  console.error('missing VOYAGE_API_KEY — pass it with --env <file> (e.g. vercel env pull output)')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── tunables ─────────────────────────────────────────────────────────
const EMBED_BATCH = 16          // rows per Voyage call
const KEYWORD_CONCURRENCY = 4   // parallel Haiku calls within a chunk
const TPM_BUDGET = 9000         // stay under the 10K free-tier tokens/min
const MIN_CALL_SPACING_MS = 20_000 // 3 RPM → ≥20s between Voyage calls
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── keyword generation (mirrors lib/enrichKeywords.ts) ───────────────
function buildKeywordPrompt(b) {
  let host = ''
  try { if (b.url) host = new URL(b.url).hostname.replace(/^www\./, '') } catch {}
  const context = [
    b.title && `Title: ${b.title}`,
    b.description && `Description: ${b.description}`,
    host && `Source: ${host}`,
  ].filter(Boolean).join('\n')
  return (
    `You generate compact English SEARCH KEYWORDS for a saved bookmark, to ` +
    `improve semantic search recall. Include: the concrete object/product ` +
    `type, its category, and common synonyms — INCLUDING English terms even ` +
    `when the page is in another language (translate foreign product nouns to ` +
    `English, e.g. "chapeau" → "hat"). Also include brand or notable proper ` +
    `nouns.\n\nBookmark:\n${context}\n\n` +
    `Reply with ONLY a single line of 5-12 lowercase keywords/short phrases, ` +
    `comma-separated. No explanation, no numbering, no quotes.`
  )
}

function cleanKeywords(raw) {
  const seen = new Set()
  return raw
    .replace(/\s+/g, ' ')
    .split(',')
    .map((p) => p.trim().replace(/^[-*\d.)\s]+/, '').replace(/^["'“”]+|["'“”.]+$/g, '').toLowerCase().trim())
    .filter((p) => {
      if (!p || p.length > 40 || seen.has(p)) return false
      seen.add(p)
      return true
    })
    .slice(0, 12)
    .join(', ')
    .slice(0, 300)
}

async function enrichKeywords(b) {
  if (!b.title && !b.description) return ''
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 120, messages: [{ role: 'user', content: buildKeywordPrompt(b) }] }),
      })
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= 4) return ''
        const ra = Number(res.headers.get('retry-after'))
        await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 500 * 2 ** attempt)
        continue
      }
      if (!res.ok) return ''
      const data = await res.json()
      const raw = data?.content?.[0]?.text
      return typeof raw === 'string' ? cleanKeywords(raw) : ''
    } catch {
      if (attempt >= 4) return ''
      await sleep(500 * 2 ** attempt)
    }
  }
}

// ── embed (mirrors lib/embed.ts; returns { vectors, tokens }) ────────
function bookmarkToEmbedText(b) {
  let host = ''
  try { if (b.url) host = new URL(b.url).hostname } catch {}
  return [b.title || '', b.description || '', host, b.keywords || '']
    .filter(Boolean).join(' — ').slice(0, 2000)
}

async function embedDocs(texts) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${VOYAGE_KEY}` },
      body: JSON.stringify({ input: texts, model: 'voyage-3-lite', input_type: 'document' }),
    })
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 5) throw new Error(`voyage ${res.status} after retries`)
      const ra = Number(res.headers.get('retry-after'))
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** attempt
      console.log(`   voyage ${res.status} — backing off ${Math.round(wait / 1000)}s`)
      await sleep(wait)
      continue
    }
    if (!res.ok) throw new Error(`voyage ${res.status}: ${await res.text().catch(() => '')}`)
    const data = await res.json()
    const vectors = [...(data.data || [])].sort((a, b) => a.index - b.index).map((d) => d.embedding)
    const tokens = data?.usage?.total_tokens || texts.join(' ').length / 4
    return { vectors, tokens }
  }
}

// run an async mapper over items with bounded concurrency
async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx], idx)
      }
    }),
  )
  return out
}

// ── main ─────────────────────────────────────────────────────────────
async function main() {
  console.log(`backfill-keywords ${DRY_RUN ? '(DRY RUN) ' : ''}— ${FORCE ? 'ALL rows' : 'rows missing keywords'}${LIMIT ? `, limit ${LIMIT}` : ''}`)

  // Count the work first so the ETA is honest.
  let countQ = sb.from('bookmarks').select('id', { count: 'exact', head: true })
  if (!FORCE) countQ = countQ.is('keywords', null)
  const { count: todo } = await countQ
  const total = LIMIT ? Math.min(LIMIT, todo || 0) : todo || 0
  console.log(`${total} bookmark(s) to process\n`)
  if (total === 0) return

  let done = 0, errors = 0
  const startedAt = Date.now()

  // Page through in EMBED_BATCH chunks. We always re-query from the top with the
  // same filter: as rows get keywords written, the "keywords IS NULL" window
  // shrinks, so range(0, BATCH) keeps handing back fresh rows (no offset drift).
  // With --force we page by offset since the filter doesn't shrink.
  let offset = 0
  for (;;) {
    if (LIMIT && done >= LIMIT) break

    let q = sb.from('bookmarks').select('id, title, description, url').order('created_at', { ascending: true })
    if (FORCE) q = q.range(offset, offset + EMBED_BATCH - 1)
    else q = q.is('keywords', null).range(0, EMBED_BATCH - 1)

    const { data: rows, error } = await q
    if (error) { console.error('select failed:', error.message); process.exit(1) }
    if (!rows || rows.length === 0) break

    const chunk = LIMIT ? rows.slice(0, LIMIT - done) : rows

    // 1) keywords (concurrent Haiku)
    const keywords = await mapPool(chunk, KEYWORD_CONCURRENCY, (r) => enrichKeywords(r))

    // 2) embed texts + one Voyage call
    const withText = chunk
      .map((r, i) => ({ r, kw: keywords[i], text: bookmarkToEmbedText({ ...r, keywords: keywords[i] }) }))
      .filter((x) => x.text.trim().length > 0)

    if (DRY_RUN) {
      for (const { r, kw } of withText) console.log(`  • ${(r.title || r.url).slice(0, 46).padEnd(46)}  →  ${kw}`)
      done += chunk.length
      offset += rows.length
      if (rows.length < EMBED_BATCH) break
      continue
    }

    let vectors, tokens
    try {
      ({ vectors, tokens } = await embedDocs(withText.map((x) => x.text)))
    } catch (e) {
      console.error('embed failed:', e.message); process.exit(1)
    }

    // 3) write keywords + embedding per row
    for (let k = 0; k < withText.length; k++) {
      const { r, kw } = withText[k]
      const { error: updErr } = await sb
        .from('bookmarks')
        .update({ keywords: kw, embedding: `[${vectors[k].join(',')}]` })
        .eq('id', r.id)
      if (updErr) { errors++; if (errors <= 3) console.error(`  update ${r.id} failed: ${updErr.message}`) }
      else done++
    }
    // Rows whose embed text was empty still need keywords stamped so the
    // resumable filter doesn't loop on them forever.
    for (const r of chunk) {
      if (withText.some((x) => x.r.id === r.id)) continue
      await sb.from('bookmarks').update({ keywords: keywords[chunk.indexOf(r)] || '' }).eq('id', r.id)
      done++
    }

    const elapsedMin = (Date.now() - startedAt) / 60000
    const rate = done / Math.max(elapsedMin, 0.01)
    const etaMin = rate > 0 ? (total - done) / rate : 0
    console.log(`  ${done}/${total} done  (${tokens} tok, ~${Math.round(rate)}/min, ETA ~${Math.round(etaMin)}m)`)

    offset += rows.length
    if (!LIMIT && !FORCE && rows.length < EMBED_BATCH) {
      // fewer than a full batch of NULL rows came back — nearly done; loop once
      // more to catch stragglers, then the next select returns 0 and we exit.
    }

    // pace: keep average tokens/min under budget, and ≥20s between calls.
    const tokenPaceMs = (tokens / TPM_BUDGET) * 60_000
    await sleep(Math.max(tokenPaceMs, MIN_CALL_SPACING_MS))
  }

  console.log(`\ndone: ${done} processed, ${errors} errors`)
}

main().catch((e) => { console.error(e); process.exit(1) })
