#!/usr/bin/env node
// Reproducible seed script for leaving-this-here.
//
// What it does (gated by flags):
//   --wipe       delete every profile / bookmark / follow EXCEPT the user
//                whose username equals KEEP_USERNAME (default: "tim")
//   --seed       create 12 persona profiles, fetch metadata + tags + embeddings
//                for each link in the CSV, insert bookmarks, build a follow graph
//   --dry-run    print what would happen without touching the database
//   --csv PATH   override the CSV path (default: $HOME/Desktop/all-newsletter-links-final.csv)
//
// Required env (in .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY    (admin — bypasses RLS)
//   ANTHROPIC_API_KEY            (for tag generation)
//   VOYAGE_API_KEY               (for embeddings — optional, script will skip if missing)
//
// Prereq: a Next.js dev server must be running on http://localhost:3000
//   (the script calls /api/fetch-metadata for each URL — same scraper as prod)
//
// Run from the repo root:
//   node scripts/seed.mjs --dry-run            # preview
//   node scripts/seed.mjs --wipe --dry-run     # preview wipe
//   node scripts/seed.mjs --wipe --seed        # the real thing

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createClient } from '@supabase/supabase-js'

const DEV_SERVER = 'http://localhost:3000'

// ── Args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (k) => args.includes(k)
const argVal = (k, def) => {
  const i = args.indexOf(k)
  return i >= 0 && args[i + 1] ? args[i + 1] : def
}

const DRY = flag('--dry-run')
const DO_WIPE = flag('--wipe')
const DO_SEED = flag('--seed')
const CSV_PATH = argVal('--csv', path.join(os.homedir(), 'Desktop', 'all-newsletter-links-final.csv'))
const KEEP_USERNAME = argVal('--keep', 'tim')

if (!DO_WIPE && !DO_SEED) {
  console.error('usage: node scripts/seed.mjs [--wipe] [--seed] [--dry-run] [--csv PATH] [--keep USERNAME]')
  process.exit(1)
}

// ── Env loader (no dotenv dependency) ────────────────────────────────
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    const k = line.slice(0, i).trim()
    const v = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const VOYAGE_KEY = process.env.VOYAGE_API_KEY

if (!SUPABASE_URL) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL in .env.local')
  process.exit(1)
}
if (!SERVICE_KEY && !DRY) {
  console.error('missing SUPABASE_SERVICE_ROLE_KEY in .env.local (required unless --dry-run)')
  process.exit(1)
}
if (!SERVICE_KEY && DRY) {
  console.warn('⚠️  SUPABASE_SERVICE_ROLE_KEY not set — dry run will show plan only, no DB queries')
}
if (DO_SEED && !ANTHROPIC_KEY) {
  console.warn('⚠️  ANTHROPIC_API_KEY not set — bookmarks will be inserted with empty tags')
}
if (DO_SEED && !VOYAGE_KEY) {
  console.warn('⚠️  VOYAGE_API_KEY not set — bookmarks will be inserted without embeddings (run /api/backfill-embeddings later)')
}

const sb = SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null

// ── Personas (matches the cluster algorithm output) ──────────────────
const PERSONAS = [
  { key: 'design',    username: 'taracreates',  display: 'Tara Mendoza',    bio: 'branding nerd. studios, identity systems, and the agencies doing it right.',
    pri: ['design & branding','branding','design studio','typography','agency','visual systems','editorial design'], sec: ['portfolio','strategy'], name: ['studio','design','brand','bureau'] },
  { key: 'illustr',   username: 'leoposters',   display: 'Leo Park',        bio: 'graphic design, posters, and the type that catches my eye.',
    pri: ['illustration','graphic design','poster','poster design','print','printmaking','animation','motion'], sec: ['art','editorial','type','typography'], name: ['illust','draw','print','poster','graphix','art'] },
  { key: 'fashion',   username: 'jadewears',    display: 'Jade Okonkwo',    bio: 'fashion, streetwear, and the brands i\'d actually wear.',
    pri: ['fashion','footwear','accessories','jewelry','streetwear','vintage','menswear','womenswear'], sec: ['workwear','retail'], name: ['wear','jean','coat','shoe','denim','fits','cloth'] },
  { key: 'dtc',       username: 'lucasshops',   display: 'Lucas Brennan',   bio: 'consumer brands, packaging, and the new wave of dtc.',
    pri: ['ecommerce','dtc','retail','consumer','consumer brand','marketing','growth'], sec: ['shopify','brand'], name: ['shop','store','direct'] },
  { key: 'food',      username: 'mariacooks',   display: 'Maria Lopez',     bio: 'restaurants, snacks, and what\'s good in the kitchen.',
    pri: ['food & beverage','coffee','snacks','restaurants','alt ingredients','cooking','beer','wine','non-alcoholic'], sec: ['hospitality','agriculture','farming'], name: ['coffee','tea','wine','sauce','dip','snack','food','drink','cafe','restaurant','recipe','beer','beverage'] },
  { key: 'dev',       username: 'samships',     display: 'Sam Chen',        bio: 'dev tools, b2b software, and what\'s worth installing.',
    pri: ['developer tools','saas','productivity','tech','hardware','platform','b2b','crm','collaboration','email','database','infrastructure'], sec: ['cloud','open source','data'], name: ['dev','app','soft','api','code','platform','cloud'] },
  { key: 'ai',        username: 'amayalabs',    display: 'Amaya Reddy',     bio: 'ai, agents, and the startups building the future.',
    pri: ['ai','llm','agents','genai','ml','startup','venture','vc','fintech','funding'], sec: ['company','b2b'], name: ['ai','gpt','llm','agent','labs','model','venture'] },
  { key: 'culture',   username: 'noracites',    display: 'Nora Whitfield',  bio: 'magazines, essays, and the writers worth reading.',
    pri: ['publication','media','culture','community','journalism','newsletter','editorial','magazine','photography','film','music','podcast','books'], sec: ['essay','writing','art'], name: ['mag','press','journal','radio','tv','podcast','news','review','book','essay','read','blog'] },
  { key: 'wellness',  username: 'lailaglow',    display: 'Laila Hassan',    bio: 'skincare, wellness, and health that actually works.',
    pri: ['health & wellness','beauty & skincare','fitness','skincare','mental health','wellness','medical','therapy','sleep','nutrition'], sec: ['supplement','vitamin','clinic'], name: ['skin','beauty','therapy','spa','sleep','meditat','wellness','health','clinic','gym','diet','vitamin','supplement','care'] },
  { key: 'outdoors',  username: 'jakeruns',     display: 'Jake Andersen',   bio: 'running, gear, and the outdoors. weekend warrior energy.',
    pri: ['sport & outdoors','running','hiking','cycling','outdoors','adventure','climbing','skiing','surf','travel','safety gear'], sec: ['hardware','gear','equipment'], name: ['outdoor','run','bike','hike','climb','ski','trail','camp','surf','travel','adventure','gear','sport','tent','pack'] },
  { key: 'home',      username: 'sophiaspace',  display: 'Sophia Vidal',    bio: 'interiors, hospitality, and the spaces i\'d want to live in.',
    pri: ['home & living','interiors','furniture','decor','architecture','homeware','garden','lighting','hospitality','spaces','hotel','real estate','property','venue','retail design'], sec: ['design','place','city','urbanism','london','nyc','paris','tokyo'], name: ['home','interior','furnit','lamp','chair','sofa','decor','architect','garden','house','room','space','table','rug','tile','plant','hotel','venue','place','park','city','london','nyc','paris','york','street','building','tower','shop','store','market'] },
  { key: 'lifestyle', username: 'benokeeps',    display: "Ben O'Keefe",     bio: 'kids, pets, and the sustainable stuff that lasts.',
    pri: ['family & kids','pets','parenting','education','games','gaming','sustainability','climate','stationery','toys','craft','play'], sec: ['community','school'], name: ['kid','baby','pet','dog','cat','game','toy','famil','school','craft','climate','green','sustain','play','parent','student'] },
]

// ── CSV parser (handles quoted fields) ───────────────────────────────
function parseCSV(text) {
  const rows = []
  let i = 0, field = '', row = [], q = false
  while (i < text.length) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue }
      if (c === '"') { q = false; i++; continue }
      field += c; i++; continue
    }
    if (c === '"') { q = true; i++; continue }
    if (c === ',') { row.push(field); field = ''; i++; continue }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''; rows.push(row); row = []; i++; continue
    }
    field += c; i++
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

function loadLinks() {
  const text = fs.readFileSync(CSV_PATH, 'utf8')
  const rows = parseCSV(text).filter((r) => r.length >= 4 && r[0] && r[0] !== 'name')
  return rows.map((r) => ({
    name: r[0],
    url: r[1],
    tags: (r[3] || '').split('/').map((t) => t.trim().toLowerCase()).filter(Boolean),
  }))
}

// ── Cluster (same algorithm as the planning step) ────────────────────
function score(link, persona) {
  let s = 0
  const tagsSet = new Set(link.tags)
  for (const t of persona.pri) if (tagsSet.has(t)) s += 5
  for (const t of persona.sec) if (tagsSet.has(t)) s += 2
  const blob = (link.name + ' ' + link.url).toLowerCase()
  for (const w of persona.name) if (w.length >= 3 && blob.includes(w)) s += 1
  return s
}

function clusterLinks(links) {
  const TARGET = 35, HARD_CAP = 40
  const buckets = Object.fromEntries(PERSONAS.map((p) => [p.key, []]))
  const scoreMap = links.map((link) => ({
    link,
    ranked: PERSONAS.map((p) => ({ key: p.key, s: score(link, p) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s),
  }))
  scoreMap.forEach((sm) => (sm.topScore = sm.ranked[0]?.s || 0))

  // Pass 1: confident links (score >= 5) take their first available slot
  scoreMap.sort((a, b) => b.topScore - a.topScore)
  for (const sm of scoreMap) {
    if (sm.topScore < 5) break
    for (const r of sm.ranked) if (buckets[r.key].length < HARD_CAP) { buckets[r.key].push(sm.link); break }
  }
  // Pass 2: weak/unmatched links fill thin buckets first
  const placed = new Set([].concat(...Object.values(buckets)).map((l) => l.url))
  const remaining = scoreMap.filter((sm) => !placed.has(sm.link.url))
  for (const sm of remaining) {
    const ranked = sm.ranked.length ? sm.ranked.slice() : PERSONAS.map((p) => ({ key: p.key, s: 0 }))
    ranked.sort((a, b) => {
      const aThin = buckets[a.key].length < TARGET ? 1 : 0
      const bThin = buckets[b.key].length < TARGET ? 1 : 0
      if (aThin !== bThin) return bThin - aThin
      return b.s - a.s
    })
    for (const r of ranked) if (buckets[r.key].length < HARD_CAP) { buckets[r.key].push(sm.link); break }
  }
  return buckets
}

// ── Wipe ─────────────────────────────────────────────────────────────
async function wipe() {
  if (!sb) {
    console.log(`— dry run (no service key) — would look up "${KEEP_USERNAME}" and delete everything else`)
    return null
  }
  const { data: keepProfile, error: e1 } = await sb
    .from('profiles')
    .select('id, username')
    .eq('username', KEEP_USERNAME)
    .single()
  if (e1 || !keepProfile) {
    console.error(`❌ no profile with username "${KEEP_USERNAME}" — aborting wipe to avoid nuking everything`)
    process.exit(1)
  }
  const KEEP_ID = keepProfile.id
  console.log(`✓ keeping ${KEEP_USERNAME} (${KEEP_ID})`)

  // Count before
  const { count: profilesBefore } = await sb.from('profiles').select('*', { count: 'exact', head: true })
  const { count: bookmarksBefore } = await sb.from('bookmarks').select('*', { count: 'exact', head: true })
  const { count: followsBefore } = await sb.from('follows').select('*', { count: 'exact', head: true })
  console.log(`before: ${profilesBefore} profiles · ${bookmarksBefore} bookmarks · ${followsBefore} follows`)

  if (DRY) {
    console.log('— dry run — would delete all rows except those owned by ' + KEEP_USERNAME)
    return KEEP_ID
  }

  // Snapshot the IDs of every non-keeper profile — we need these later to
  // delete the corresponding auth.users rows (since admin.listUsers is broken
  // with the sb_secret_* key format).
  const { data: profilesToDelete } = await sb
    .from('profiles')
    .select('id')
    .neq('id', KEEP_ID)
  const profileIdsToDelete = (profilesToDelete || []).map((p) => p.id)

  // Order matters: bookmarks → follows → profiles → auth.users
  const { error: eB } = await sb.from('bookmarks').delete().neq('user_id', KEEP_ID)
  if (eB) console.error('bookmarks delete:', eB.message)

  const { error: eF1 } = await sb.from('follows').delete().neq('follower_id', KEEP_ID)
  if (eF1) console.error('follows delete (follower):', eF1.message)
  const { error: eF2 } = await sb.from('follows').delete().neq('following_id', KEEP_ID)
  if (eF2) console.error('follows delete (following):', eF2.message)

  const { error: eP } = await sb.from('profiles').delete().neq('id', KEEP_ID)
  if (eP) console.error('profiles delete:', eP.message)

  // Auth users — enumerate via profiles table (profile.id === auth.users.id)
  // since admin.listUsers is broken with the newer sb_secret_* key format.
  // Snapshot the profile ids BEFORE the profiles delete above, since we
  // already deleted them — re-fetch from a snapshot we kept.
  // (Hoisted: we re-collect from auth via createUser fallback isn't possible,
  // so we relied on `profileIdsToDelete` captured earlier in this function.)
  console.log(`deleting ${profileIdsToDelete.length} auth users…`)
  for (const id of profileIdsToDelete) {
    const { error } = await sb.auth.admin.deleteUser(id)
    if (error) console.error(`  delete ${id}:`, error.message)
  }

  const { count: profilesAfter } = await sb.from('profiles').select('*', { count: 'exact', head: true })
  const { count: bookmarksAfter } = await sb.from('bookmarks').select('*', { count: 'exact', head: true })
  const { count: followsAfter } = await sb.from('follows').select('*', { count: 'exact', head: true })
  console.log(`after:  ${profilesAfter} profiles · ${bookmarksAfter} bookmarks · ${followsAfter} follows`)

  return KEEP_ID
}

// ── Tag generation (calls Anthropic Haiku, mirroring /api/generate-tags) ──
async function generateTags({ url, title, description }) {
  if (!ANTHROPIC_KEY) return []
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
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 100, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) return []
    const data = await res.json()
    const text = data?.content?.[0]?.text || '[]'
    const m = text.match(/\[.*\]/)
    if (!m) return []
    return JSON.parse(m[0]).filter((t) => typeof t === 'string').map((t) => t.toLowerCase().trim()).slice(0, 5)
  } catch {
    return []
  }
}

// ── Embedding (calls Voyage, mirroring lib/embed.ts) ─────────────────
// Batched: voyage allows up to 128 docs per call. We use this to avoid the
// 3 RPM free-tier rate limit — 425 docs = ~4 calls instead of 425.
async function embedBatch(texts) {
  if (!VOYAGE_KEY || !texts.length) return null
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VOYAGE_KEY}` },
    body: JSON.stringify({ input: texts, model: 'voyage-3-lite', input_type: 'document' }),
  })
  if (!res.ok) {
    console.error('voyage error:', res.status, (await res.text().catch(() => '')).slice(0, 200))
    return null
  }
  const data = await res.json()
  return [...(data.data || [])].sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function bookmarkToEmbedText(b) {
  let host = ''
  try { if (b.url) host = new URL(b.url).hostname } catch {}
  return [b.title || '', b.description || '', host, ...(b.tags || [])].filter(Boolean).join(' — ').slice(0, 2000)
}

// ── Seed ─────────────────────────────────────────────────────────────
async function ensurePersona(p) {
  // Idempotent: if a profile with this username already exists, return its id.
  const { data: existing } = await sb.from('profiles').select('id').eq('username', p.username).maybeSingle()
  if (existing) return existing.id

  const email = `${p.username}@seed.leavingthishere.local`
  const password = 'seedseed-' + Math.random().toString(36).slice(2, 10)
  const { data, error } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (error) throw new Error(`createUser ${p.username}: ${error.message}`)
  const userId = data.user.id
  const { error: pe } = await sb.from('profiles').insert({
    id: userId, username: p.username, display_name: p.display, bio: p.bio,
  })
  if (pe) throw new Error(`profile ${p.username}: ${pe.message}`)
  return userId
}

async function fetchMetadata(url) {
  try {
    const res = await fetch(`${DEV_SERVER}/api/fetch-metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function seedBookmark(userId, url, existingUrls) {
  // Idempotent: skip if this user already has a bookmark for this URL
  if (existingUrls.has(url)) return 'skip'

  // 1. Fetch metadata via the project's own scraper (running on localhost dev server)
  const meta = await fetchMetadata(url)
  if (!meta || (!meta.title && !meta.description)) {
    return null // skip dead links / blocked sites
  }

  // 2. Generate tags via Claude
  const tags = await generateTags({ url, title: meta.title, description: meta.description })

  // 3. Insert WITHOUT embedding — we batch-embed all NULL rows in a final phase
  //    to avoid hammering Voyage's 3 RPM free-tier limit.
  const { data, error } = await sb.from('bookmarks').insert({
    user_id: userId,
    url,
    title: meta.title,
    description: meta.description,
    image_url: meta.image,
    favicon_url: meta.favicon,
    tags,
    is_private: false,
    raw_metadata: meta.raw,
    embedding: null,
  }).select('id').single()
  if (error) {
    console.error(`  insert fail ${url}:`, error.message)
    return null
  }
  existingUrls.add(url)
  return data.id
}

// ── Final phase: batch-embed all bookmarks where embedding IS NULL ───
async function backfillEmbeddingsBatch() {
  if (!VOYAGE_KEY) {
    console.log('skipping embedding backfill — VOYAGE_API_KEY not set')
    return
  }
  // Pull all rows missing embeddings
  const { data: rows, error } = await sb
    .from('bookmarks')
    .select('id, url, title, description, tags')
    .is('embedding', null)
  if (error) { console.error('select missing-embedding rows:', error.message); return }
  if (!rows || rows.length === 0) { console.log('no rows need embedding'); return }
  console.log(`embedding ${rows.length} bookmarks in batches of 128…`)

  const BATCH_SIZE = 128
  // Free tier: 3 RPM, 10K TPM. Sleep 25s between batches to stay under 3 RPM.
  const SLEEP_BETWEEN_BATCHES_MS = 25000

  let ok = 0, fail = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const texts = batch.map((b) => bookmarkToEmbedText(b))
    const vectors = await embedBatch(texts)
    if (!vectors || vectors.length !== batch.length) {
      console.error(`  batch ${i}-${i + batch.length}: failed`)
      fail += batch.length
    } else {
      // Write back one row at a time (PostgREST upsert with vectors is fiddly)
      for (let j = 0; j < batch.length; j++) {
        const literal = `[${vectors[j].join(',')}]`
        const { error: ue } = await sb
          .from('bookmarks')
          .update({ embedding: literal })
          .eq('id', batch[j].id)
        if (ue) { console.error(`  update ${batch[j].id}:`, ue.message); fail++ }
        else ok++
      }
      console.log(`  batch ${i + batch.length}/${rows.length}: ${batch.length} embedded`)
    }
    if (i + BATCH_SIZE < rows.length) {
      console.log(`  sleeping ${SLEEP_BETWEEN_BATCHES_MS / 1000}s for rate limit…`)
      await sleep(SLEEP_BETWEEN_BATCHES_MS)
    }
  }
  console.log(`embedding done: ${ok} ok, ${fail} failed`)
}

async function seed(keepId) {
  const links = loadLinks()
  console.log(`loaded ${links.length} links from CSV`)
  const buckets = clusterLinks(links)
  console.log('cluster:')
  for (const p of PERSONAS) console.log(`  ${p.key.padEnd(10)} ${buckets[p.key].length}`)

  if (DRY) {
    console.log('— dry run — would create 12 personas + insert ~' +
      Object.values(buckets).reduce((a, b) => a + b.length, 0) + ' bookmarks')
    return
  }

  // 1. Create or reuse personas (idempotent)
  const personaIds = {}
  for (const p of PERSONAS) {
    try {
      const id = await ensurePersona(p)
      personaIds[p.key] = id
      console.log(`✓ ${p.username} (${id.slice(0, 8)})`)
    } catch (err) {
      console.error(`✗ ${p.username}: ${err.message}`)
    }
  }

  // 2. Seed bookmarks (sequential, idempotent — skips URLs already saved per user)
  let totalNew = 0, totalSkip = 0, totalFail = 0
  for (const p of PERSONAS) {
    const userId = personaIds[p.key]
    if (!userId) continue
    const links = buckets[p.key]
    // Pre-fetch existing URLs for this user so we can skip them
    const { data: existing } = await sb.from('bookmarks').select('url').eq('user_id', userId)
    const existingUrls = new Set((existing || []).map((r) => r.url))
    console.log(`\n→ @${p.username} — ${links.length} links (${existingUrls.size} already saved)`)
    for (let i = 0; i < links.length; i++) {
      const link = links[i]
      const r = await seedBookmark(userId, link.url, existingUrls)
      if (r === 'skip') { totalSkip++; process.stdout.write('-') }
      else if (r) { totalNew++; process.stdout.write('.') }
      else { totalFail++; process.stdout.write('x') }
      if ((i + 1) % 10 === 0) process.stdout.write(` ${i + 1}/${links.length}\n`)
    }
    process.stdout.write('\n')
  }
  console.log(`\nbookmarks: ${totalNew} new, ${totalSkip} skipped (already existed), ${totalFail} failed (dead links)`)

  // 3. Final phase: batch-embed everything that's missing an embedding
  console.log('\n=== embedding backfill ===')
  await backfillEmbeddingsBatch()

  // 4. Follow graph: each persona follows 3 random others, plus tim follows 4 random ones
  const allIds = Object.values(personaIds)
  const follows = []
  for (const id of allIds) {
    const others = allIds.filter((x) => x !== id).sort(() => Math.random() - 0.5).slice(0, 3)
    for (const o of others) follows.push({ follower_id: id, following_id: o })
  }
  if (keepId) {
    const tims = allIds.sort(() => Math.random() - 0.5).slice(0, 4)
    for (const o of tims) follows.push({ follower_id: keepId, following_id: o })
  }
  if (follows.length) {
    const { error } = await sb.from('follows').upsert(follows, { onConflict: 'follower_id,following_id' })
    if (error) console.error('follows insert:', error.message)
    else console.log(`✓ ${follows.length} follow relationships`)
  }
}

// ── Main ─────────────────────────────────────────────────────────────
;(async () => {
  console.log(`mode: ${DO_WIPE ? 'WIPE ' : ''}${DO_SEED ? 'SEED ' : ''}${DRY ? '(dry-run)' : ''}`)
  let keepId = null
  if (DO_WIPE) keepId = await wipe()
  if (DO_SEED) {
    if (!keepId && sb) {
      const { data } = await sb.from('profiles').select('id').eq('username', KEEP_USERNAME).single()
      keepId = data?.id || null
    }
    await seed(keepId)
  }
  console.log('done.')
})().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
