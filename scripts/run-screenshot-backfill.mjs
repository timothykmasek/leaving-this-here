// Loop /api/persist-screenshots until every `screenshot`/`lth` card has its
// screenshot captured once and stored in Supabase Storage.
//
// Drain-based: each batch asks for rows that still need a screenshot, so the
// unfinished set shrinks as we go and offset stays 0. Rate-limited rows simply
// reappear next batch and get retried. We stop once several consecutive batches
// make zero progress (remaining failures are dead domains / unreachable sites).
//
// Run the dev server first: `npm run dev`.

const ENDPOINT = 'http://localhost:3000/api/persist-screenshots'
const BATCH = 12             // route processes these 3-at-a-time (bounded concurrency)
const BATCH_PAUSE_MS = 800   // brief breather between batches
const MAX_ZERO_PROGRESS = 4  // stop after this many no-progress batches in a row

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let batchNum = 0
let totalPersisted = 0
let totalFailed = 0
let zeroStreak = 0
const start = Date.now()

while (true) {
  batchNum++
  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: BATCH }),
    })
  } catch (err) {
    console.error(`batch ${batchNum}: network error`, err.message)
    break
  }

  if (!res.ok) {
    const text = await res.text()
    console.error(`batch ${batchNum}: HTTP ${res.status} — ${text.slice(0, 300)}`)
    break
  }

  const data = await res.json()
  totalPersisted += data.persisted || 0
  totalFailed += data.failed || 0

  const elapsed = Math.round((Date.now() - start) / 1000)
  console.log(
    `batch ${batchNum}: +${data.persisted} stored, ${data.marked || 0} dead-marked, ${data.failed} failed` +
    (data.rateLimited ? ` (${data.rateLimited} rate-limited)` : '') +
    ` — total stored ${totalPersisted} — ${elapsed}s`,
  )
  if (data.failures?.length) {
    for (const f of data.failures.slice(0, 3)) console.log(`    ✗ ${f.url} — ${f.error}`)
  }

  if (!data.hasMore) break

  // Progress = anything that left the queue (persisted OR marked dead). Only a
  // batch that did neither (and wasn't merely rate-limited) counts as a stall.
  const progress = (data.persisted || 0) + (data.marked || 0)
  if (progress === 0 && (data.rateLimited || 0) === 0) {
    zeroStreak++
    if (zeroStreak >= MAX_ZERO_PROGRESS) {
      console.log(`\nStopping: ${MAX_ZERO_PROGRESS} batches with no progress.`)
      break
    }
  } else {
    zeroStreak = 0
  }

  await sleep(data.rateLimited ? 10000 : BATCH_PAUSE_MS)
}

const elapsed = Math.round((Date.now() - start) / 1000)
console.log(`\n=== screenshot backfill done ===`)
console.log(`  stored:  ${totalPersisted}`)
console.log(`  failed:  ${totalFailed}`)
console.log(`  elapsed: ${elapsed}s (${(elapsed / 60).toFixed(1)} min)`)
