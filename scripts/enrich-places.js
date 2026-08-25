/* Enrich PLACE bullets (Google/Apple Maps links) from their stored capture.
 *
 *   node scripts/enrich-places.js            # dry run, prints what it would do
 *   node scripts/enrich-places.js --write    # actually write
 *   node scripts/enrich-places.js --write --force   # redo already-enriched rows
 *   node scripts/enrich-places.js --id <uuid>       # one bullet
 *
 * Why a script and not the save path: cropping needs image processing, and this
 * repo has no sharp — it shells out to ImageMagick, which exists on a laptop and
 * not on Vercel. The durable fix is for the extension to read the hero photo's
 * <img> src straight out of the DOM at save time, which needs no cropping at
 * all; this exists to enrich the rows saved before that lands.
 *
 * Idempotent: a row that already has raw_metadata.place.photo is skipped.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const Module = require('module')

// Let the TS modules resolve '@/...' the way Next does.
const origResolve = Module._resolveFilename
Module._resolveFilename = function (req, ...a) {
  if (req.startsWith('@/')) req = path.join(__dirname, '..', req.slice(2))
  return origResolve.call(this, req, ...a)
}
require('sucrase/register/ts')

const { createClient } = require('@supabase/supabase-js')
const { isPlaceUrl, parsePlaceUrl, geocodePlace } = require('../lib/placeLink')
const { extractPlaceFacts, extractPhotoEdges, cropBoxFromEdges } = require('../lib/placeExtract')

const argv = process.argv.slice(2)
const WRITE = argv.includes('--write')
const FORCE = argv.includes('--force')
const ONLY_ID = argv.includes('--id') ? argv[argv.indexOf('--id') + 1] : null

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const BUCKET = 'card-images'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Deterministic search keywords from the place itself. The stored ones describe
 *  Maps-the-product ("directions, navigation, route planner") for every place. */
function placeKeywords(facts, resolved, urlName) {
  const out = []
  const push = (v) => {
    if (!v) return
    const s = String(v).trim().toLowerCase()
    if (s && !out.includes(s)) out.push(s)
  }
  const name = facts?.name || urlName || resolved?.name
  push(name)
  push(facts?.kind)
  push(resolved?.kind && String(resolved.kind).replace(/_/g, ' '))
  push(resolved?.city)
  push(resolved?.country)
  if (resolved?.addressLine) resolved.addressLine.split(',').forEach((p) => push(p))
  if (facts?.address) {
    facts.address.split(',').forEach((p) => push(p.replace(/\d{4,}/g, '').trim()))
  }
  push('place')
  return out.filter(Boolean).join(', ')
}


// ── Finding the hero photo without asking a model ───────────────────────────
//
// extractPhotoEdges() asks Haiku for the photo's four edges. On Cherry Paris it
// returned 385x153 where the photo is really 402x240 — it came in 87px short and
// sliced the tops off the bar stools, which is why that card rendered as a
// letterbox strip half the height of its neighbours.
//
// Google's place panel doesn't need a model. The hero photo is the only large
// DARK region at the top of an otherwise white panel, and ImageMagick can
// average whole rows and columns in one pass each:
//
//   • rows:    crop the panel column, squash to 1px wide -> each pixel is a row
//              mean. Photo rows measure 11-42; panel rows 254-255. The gap is a
//              chasm, not a threshold anyone had to tune.
//   • columns: crop the top band, squash to 1px tall -> the photo is the long
//              dark run; the left rail and the map are both light.
//
// The one subtlety is the floating search bar, which is a white island INSIDE
// the photo (rows ~12-60 read 239). Requiring the white to be SUSTAINED steps
// over it: the panel below the photo stays white for hundreds of rows, the
// search bar doesn't.
function meansAlong(file, cropGeom, resizeGeom) {
  const out = execFileSync('magick', [
    file, '-crop', cropGeom, '+repage', '-colorspace', 'gray',
    '-resize', resizeGeom, '-depth', '8', 'txt:-',
  ]).toString()
  return out.split('\n').slice(1)
    .map((l) => { const m = l.match(/gray\((\d+)\)/); return m ? Number(m[1]) : null })
    .filter((n) => n !== null)
}

function photoBoxFromPixels(file, w, h) {
  try {
    // Horizontal: the photo is the longest dark run across the top band.
    const cols = meansAlong(file, `${w}x${Math.min(200, h)}+0+60`, `${w}x1!`)
    let best = null, start = null
    cols.concat([255]).forEach((m, x) => {
      if (m < 170 && start === null) start = x
      else if (m >= 170 && start !== null) {
        if (!best || x - start > best[1] - best[0]) best = [start, x]
        start = null
      }
    })
    if (!best || best[1] - best[0] < 120) return null
    const [l, r] = best

    // Vertical: the first row that is white AND STAYS white — stepping over the
    // search bar, which is white but only ~48 rows tall.
    const rows = meansAlong(file, `${r - l}x${h}+${l}+0`, `1x${h}!`)
    const sustained = (y) => {
      for (let k = y; k < Math.min(rows.length, y + 60); k++) if (rows[k] <= 200) return false
      return true
    }
    let bottom = null
    for (let y = 0; y < rows.length; y++) {
      if (rows[y] > 230 && sustained(y)) { bottom = y; break }
    }
    if (!bottom || bottom < 80) return null

    // The search bar floats ON the photo, so cropping from y=0 puts Google's
    // own chrome in the card. Start below it instead: take the end of the last
    // white run that begins in the top ~80 rows. (There's usually a sliver of
    // photo above the bar too — losing it costs a dozen pixels and beats
    // shipping a search field.)
    let top = 0
    for (let y = 0; y < Math.min(80, bottom); y++) {
      if (rows[y] > 200) {
        let e = y
        while (e < bottom && rows[e] > 200) e++
        if (e < bottom) top = e
        y = e
      }
    }
    return [l, top, r, bottom]
  } catch {
    return null
  }
}

async function main() {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY missing from .env.local')

  let q = sb.from('bookmarks').select('id,url,title,image_url,screenshot_url,raw_metadata,keywords')
  if (ONLY_ID) q = q.eq('id', ONLY_ID)
  const { data, error } = await q
  if (error) throw error

  const places = (data || []).filter((b) => isPlaceUrl(b.url))
  console.log(`${places.length} place bullet(s)${ONLY_ID ? ' (filtered by --id)' : ''}\n`)

  for (const b of places) {
    const already = b.raw_metadata?.place?.photo
    if (already && !FORCE) { console.log(`skip ${b.id} — already enriched`); continue }
    if (!b.screenshot_url) { console.log(`skip ${b.id} — no capture to read`); continue }

    console.log(`\n── ${b.id}\n   ${b.url.slice(0, 88)}`)

    const res = await fetch(b.screenshot_url)
    if (!res.ok) { console.log(`   capture fetch failed: ${res.status}`); continue }
    const buf = Buffer.from(await res.arrayBuffer())
    const tmp = path.join(os.tmpdir(), `place-${b.id}.jpg`)
    fs.writeFileSync(tmp, buf)
    const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', tmp])
      .toString().trim().split(' ').map(Number)
    console.log(`   capture ${w}x${h}`)

    const b64 = buf.toString('base64')
    const [facts, edges] = await Promise.all([
      extractPlaceFacts(env.ANTHROPIC_API_KEY, b64),
      extractPhotoEdges(env.ANTHROPIC_API_KEY, b64),
    ])
    if (!facts) { console.log('   no facts extracted — skipping'); continue }
    console.log(`   facts  ${JSON.stringify(facts)}`)

    // Coordinates: the URL's own if it has them, else a name lookup. Accuracy
    // is far better with the URL's coords — see lib/placeLink.
    const parsed = parsePlaceUrl(b.url)
    const resolved = parsed.name || facts.name
      ? await geocodePlace(facts.name || parsed.name, { lat: parsed.lat, lon: parsed.lon })
      : null
    if (resolved) console.log(`   geocode ${resolved.lat},${resolved.lon} ${resolved.addressLine || ''}`)

    // Measure the photo off the pixels first; the model is the fallback now,
    // not the other way round.
    const measured = photoBoxFromPixels(tmp, w, h)
    if (measured) console.log(`   measured ${measured[2] - measured[0]}x${measured[3] - measured[1]} (pixels, no model)`)

    let photoUrl = null
    if (measured || edges) {
      const [l, t, r, bo] = measured || cropBoxFromEdges(edges, w, h)
      const cw = r - l, ch = bo - t
      console.log(`   crop   ${cw}x${ch} at ${l},${t}`)
      if (cw > 80 && ch > 60) {
        const out = path.join(os.tmpdir(), `place-${b.id}-crop.jpg`)
        execFileSync('magick', [tmp, '-crop', `${cw}x${ch}+${l}+${t}`, '+repage', '-quality', '90', out])
        if (WRITE) {
          const key = `place/${b.id}.jpg`
          const { error: upErr } = await sb.storage.from(BUCKET)
            .upload(key, fs.readFileSync(out), { contentType: 'image/jpeg', upsert: true })
          if (upErr) console.log(`   upload failed: ${upErr.message}`)
          else {
            photoUrl = sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl
            console.log(`   uploaded ${key}`)
          }
        } else {
          console.log(`   (dry run — would upload place/${b.id}.jpg)`)
        }
      } else {
        console.log('   crop too small — skipping photo')
      }
    } else {
      console.log('   no photo found in capture')
    }

    const place = {
      name: facts.name || parsed.name || resolved?.name || null,
      kind: facts.kind || (resolved?.kind ? String(resolved.kind).replace(/_/g, ' ') : null),
      price: facts.price,
      rating: facts.rating,
      reviews: facts.reviews,
      // The capture's address is authoritative; the geocoder's is a fallback
      // (it put this place ~100m away, on the next street).
      address: facts.address || resolved?.addressLine || null,
      city: resolved?.city || null,
      lat: resolved?.lat ?? parsed.lat ?? null,
      lon: resolved?.lon ?? parsed.lon ?? null,
      photo: photoUrl,
      source: 'capture-vision',
    }
    const keywords = placeKeywords(facts, resolved, parsed.name)
    console.log(`   place  ${JSON.stringify(place)}`)
    console.log(`   keywords ${keywords}`)

    if (!WRITE) { console.log('   (dry run — no write)'); continue }

    const patch = {
      raw_metadata: { ...(b.raw_metadata || {}), place },
      keywords,
    }
    // The stored image_url is Google's signed static map, centred on the wrong
    // continent. The crop is a real picture of the place — put it in the og slot
    // so the existing card image routing picks it with no signature change.
    if (photoUrl) patch.image_url = photoUrl
    const { error: upErr } = await sb.from('bookmarks').update(patch).eq('id', b.id)
    console.log(upErr ? `   WRITE FAILED: ${upErr.message}` : '   written')
    await sleep(1200) // Nominatim courtesy
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
