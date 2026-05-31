// Loop the existing /api/backfill-images endpoint in fetch-missing mode
// until no NULL card_type rows remain. Logs one line per batch so you can
// tail progress.

const ENDPOINT = 'http://localhost:3000/api/backfill-images'
const BATCH = 20

let batchNum = 0
let totalProcessed = 0
let totalErrors = 0
const start = Date.now()

while (true) {
  batchNum++
  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // offset always 0: as rows get card_type set, the NULL-set shrinks
      // toward the front of the page.
      body: JSON.stringify({ limit: BATCH, offset: 0, mode: 'fetch-missing' }),
    })
  } catch (err) {
    console.error(`batch ${batchNum}: network error`, err.message)
    break
  }

  if (!res.ok) {
    const text = await res.text()
    console.error(`batch ${batchNum}: HTTP ${res.status} — ${text.slice(0, 200)}`)
    break
  }

  const data = await res.json()
  totalProcessed += data.processed || 0
  totalErrors += data.errors || 0

  const elapsed = Math.round((Date.now() - start) / 1000)
  console.log(
    `batch ${batchNum}: +${data.processed} processed, +${data.errors} errors, ` +
    `running total ${totalProcessed} (${totalErrors} err) — ${elapsed}s elapsed — hasMore=${data.hasMore}`,
  )

  if (!data.hasMore || data.total === 0) break
}

const elapsed = Math.round((Date.now() - start) / 1000)
console.log(`\n=== backfill done ===`)
console.log(`  total processed: ${totalProcessed}`)
console.log(`  total errors:    ${totalErrors}`)
console.log(`  elapsed:         ${elapsed}s (${(elapsed / 60).toFixed(1)} min)`)
