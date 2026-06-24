// One-off import: pull bookmarks from a MyMind cards.csv export into
// Bulletin. Uses the service role key so we can write directly to
// any user's collection.
//
// Usage:
//   node scripts/import-mymind.mjs <username> <path/to/cards.csv>
//
// Example:
//   node scripts/import-mymind.mjs tim /Users/timothymasek/Documents/MyMind/mymind/cards.csv

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// --- env loader -------------------------------------------------------------

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvLocal()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// --- CSV parser -------------------------------------------------------------
// Handles RFC-4180-ish quoting: fields wrapped in "" can contain commas and
// newlines; embedded quotes are doubled ("").

function parseCSV(text) {
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length

  while (i < n) {
    const c = text[i]

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }

    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      // Handle CRLF and bare CR
      if (text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += c
    i++
  }
  // Flush trailing field/row
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// --- main -------------------------------------------------------------------

async function main() {
  const username = process.argv[2]
  const csvPath = process.argv[3]
  if (!username || !csvPath) {
    console.error('Usage: node scripts/import-mymind.mjs <username> <path/to/cards.csv>')
    process.exit(1)
  }

  // Look up the user
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('username', username)
    .single()

  if (profErr || !profile) {
    console.error(`Could not find profile "${username}":`, profErr?.message || 'not found')
    process.exit(1)
  }
  console.log(`→ Importing into profile "${profile.username}" (${profile.id})`)

  // Read + parse CSV
  const csv = fs.readFileSync(csvPath, 'utf8')
  const rows = parseCSV(csv)
  if (rows.length < 2) {
    console.error('CSV looks empty.')
    process.exit(1)
  }

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name) => header.indexOf(name)
  const iUrl = col('url')
  const iTitle = col('title')
  const iTags = col('tags')
  const iCreated = col('created')

  if (iUrl === -1 || iTitle === -1) {
    console.error('CSV missing required columns: url, title')
    process.exit(1)
  }

  const records = []
  let skippedMalformed = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const url = (row[iUrl] || '').trim()
    if (!url || !/^https?:\/\//i.test(url)) {
      skippedMalformed++
      continue
    }
    const title = (row[iTitle] || '').trim() || url
    const tagsRaw = (row[iTags] || '').trim()
    const tags = tagsRaw
      ? tagsRaw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
      : []
    const created = (row[iCreated] || '').trim()

    records.push({
      user_id: profile.id,
      url,
      title,
      tags,
      created_at: created || undefined, // let DB default if missing
    })
  }

  console.log(`→ ${records.length} valid rows (${skippedMalformed} malformed skipped)`)

  // Insert one at a time so unique violations don't blow up entire batches.
  // 1,023 rows ≈ 2–4 minutes. Live progress logged every 50.
  let inserted = 0
  let duplicates = 0
  let failed = 0

  for (let i = 0; i < records.length; i++) {
    const rec = records[i]
    const { error } = await supabase.from('bookmarks').insert(rec)
    if (!error) {
      inserted++
    } else if (error.code === '23505') {
      duplicates++
    } else {
      failed++
      if (failed <= 5) {
        console.warn(`  ! row ${i + 1} failed: ${error.message} — ${rec.url}`)
      }
    }
    if ((i + 1) % 50 === 0 || i === records.length - 1) {
      process.stdout.write(`\r  progress: ${i + 1}/${records.length}  (✓ ${inserted}  • dup ${duplicates}  • err ${failed})`)
    }
  }
  process.stdout.write('\n')

  console.log('\n=== done ===')
  console.log(`  inserted:    ${inserted}`)
  console.log(`  duplicates:  ${duplicates}`)
  console.log(`  failed:      ${failed}`)
  console.log(`  malformed:   ${skippedMalformed}`)
  console.log(`  total seen:  ${records.length + skippedMalformed}`)
}

main().catch((err) => {
  console.error('Unhandled error:', err)
  process.exit(1)
})
