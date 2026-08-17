// One-off: seed the "remi" demo persona — a furniture / interiors / art profile.
//
// Mirrors the extension save pipeline (lib/metadata → classifyCardType →
// normalizeUrl → insert → enrichKeywords) so Remi's bullets are indistinguishable
// from real saves. Embeddings are left NULL when VOYAGE_API_KEY is absent; the
// nightly /api/backfill-embeddings sweep fills them in.
//
//   npx tsx scripts/seed-remi.ts --dry-run
//   npx tsx scripts/seed-remi.ts
//
// Idempotent: re-running skips the profile if it exists, skips any bullet whose
// url_key the user already has, and reuses the list.

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { extractMetadata } from '../lib/metadata'
import { classifyCardType } from '../lib/cardType'
import { normalizeUrl } from '../lib/normalizeUrl'
import { enrichKeywords } from '../lib/enrichKeywords'
import { slugify } from '../lib/slug'

for (const line of fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split('\n') : []) {
  if (!line || line.startsWith('#')) continue
  const i = line.indexOf('=')
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
}

const DRY = process.argv.includes('--dry-run')

const USERNAME = 'remi'
const DISPLAY = 'Remi'
const BIO = [
  'Furniture, interiors, and the objects in between.',
  'Chairs I can’t afford and galleries I keep going back to.',
].join('\n')
const LIST_NAME = 'Furniture Reccs'

// Curated from Tim's newsletter-source review (bulletin-sources-review-v2.xlsx):
// design/interiors publications, filtered to links whose pages still serve a
// real og:image. `furn` marks the ones that go in the list.
const LINKS: { url: string; furn?: boolean }[] = [
  { url: 'https://tribecasynagogue.org/' },
  { url: 'https://sevenwonderscollective.com/', furn: true },
  { url: 'https://noguchi.org/museum/exhibitions/view/noguchis-new-york' },
  { url: 'https://nevelsonchapel.org/' },
  { url: 'https://sunabonometti.com/collections/sculpture/products/fern-spirals' },
  { url: 'https://antwerpstudio.com/store/p40-by-osvaldo-borsani-for-tecno-1970s', furn: true },
  { url: 'https://heathwagoner.com/' },
  { url: 'https://level1gallery.com/products/copy-of-bronze-1960s-gaetano-missaglia-tabletop-mirror' },
  { url: 'https://harshcollective.com/' },
  { url: 'https://studioshields.com.au/' },
  { url: 'https://atelierbarb.com/' },
  { url: 'https://thedesignfiles.net/2025/08/interiors-flack-studio-hawksburn' },
  { url: 'https://finelittleday.com/products/tomato-poster-21x30-cm' },
  { url: 'https://nymag.com/strategist/article/clear-tablecloth-review.html' },
  { url: 'https://architecturaldigest.com/gallery/petite-parisian-inspired-townhouse-transformation-carroll-gardens' },
  { url: 'https://store.hermanmiller.com/', furn: true },
  { url: 'https://jhinteriordesign.com/' },
  { url: 'https://svenskttenn.com/us/en/range/table-setting/table-setting-details/egg-cup-oiseaux-de-paradis/110402' },
  { url: 'https://inigo.com/almanac/a-home-with-a-history-luke-edward-hall-duncan-campbell-cotswolds' },
  { url: 'https://pictureroom.shop/' },
  { url: 'https://thespacedetroit.com/', furn: true },
  { url: 'https://shop.nalatanalata.com/products/brush-and-pan-set' },
  { url: 'https://artek.fi/', furn: true },
  { url: 'https://christopherfarr.com/rug/mushroom-fall' },
  { url: 'https://incommonwith.com/', furn: true },
  { url: 'https://www.thuma.co/products/essential-modular-sofa', furn: true },
  { url: 'https://worldofinteriors.com/story/tony-liu-apartment-new-york' },
  { url: 'https://claudehome.com/', furn: true },
  { url: 'https://ilbucovita.com/collections/bosco/products/moss-terracotta-dinner-plate' },
  { url: 'https://stickley.com/', furn: true },
  { url: 'https://robertstilinshop.com/artworks/categories/1/830-gucci-ashtray-vide-poche/' },
  { url: 'https://shopmilg.com/objects/p/aluminum-ashtray' },
  { url: 'https://curbed.com/2022/09/60-wall-street-1980s-lobby-atrium-kevin-roche-preservation-landmarks.html' },
  { url: 'https://sophieloujacobsen.com/' },
  { url: 'https://businessofhome.com/articles/are-upscale-furniture-brands-finally-about-to-solve-the-ugly-recliner-problem', furn: true },
  { url: 'https://www.hyggeandwest.com/' },
  { url: 'https://ursulafutura.com/' },
  { url: 'https://marta-editions.com/' },
  { url: 'https://wallpaper.com/design/ettore-sottsass-casa-lana-triennale-milan' },
  { url: 'https://spotti.com/', furn: true },
  { url: 'https://biritestudio.com/collections/new/products/model-222-chairs-by-robert-mallet-stevens-black', furn: true },
  { url: 'https://pucesdeparissaintouen.com/', furn: true },
  { url: 'https://kellywearstler.com/', furn: true },
  { url: 'https://formandfield.com/' },
  { url: 'https://littleking.online/' },
]

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function ensureProfile(): Promise<string> {
  const { data: existing } = await sb
    .from('profiles')
    .select('id')
    .eq('username', USERNAME)
    .maybeSingle()
  if (existing) {
    console.log(`✓ profile @${USERNAME} exists (${existing.id})`)
    if (!DRY) await sb.from('profiles').update({ display_name: DISPLAY, bio: BIO }).eq('id', existing.id)
    return existing.id
  }
  if (DRY) {
    console.log(`— would create auth user + profile @${USERNAME}`)
    return '00000000-0000-0000-0000-000000000000'
  }
  const email = `${USERNAME}@seed.leavingthishere.local`
  const password = 'seedseed-' + Math.random().toString(36).slice(2, 12)
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`createUser: ${error.message}`)
  const id = data.user!.id
  const { error: pe } = await sb
    .from('profiles')
    .insert({ id, username: USERNAME, display_name: DISPLAY, bio: BIO })
  if (pe) throw new Error(`profile insert: ${pe.message}`)
  console.log(`✓ created @${USERNAME} (${id}) — login ${email} / ${password}`)
  return id
}

async function seedBullet(userId: string, url: string, seen: Set<string>) {
  const key = normalizeUrl(url)
  if (seen.has(key)) return { status: 'skip' as const, id: null }

  const meta = await extractMetadata(url)
  const title = meta.title || url
  const card_type = classifyCardType(url, meta)
  if (DRY) {
    console.log(`  — ${card_type.padEnd(10)} ${meta.image ? 'img' : 'NO-IMG'} ${title.slice(0, 54)}`)
    return { status: 'dry' as const, id: null }
  }

  const { data, error } = await sb
    .from('bookmarks')
    .insert({
      user_id: userId,
      url,
      url_key: key,
      title,
      description: meta.description,
      image_url: meta.image,
      favicon_url: meta.favicon,
      card_type,
      raw_metadata: meta.raw,
    })
    .select('id')
    .single()
  if (error) {
    console.error(`  ✗ ${url}: ${error.message}`)
    return { status: 'fail' as const, id: null }
  }
  seen.add(key)

  // Keywords (Haiku) — same enrichment the save routes run out-of-band.
  try {
    const keywords = await enrichKeywords({ title, description: meta.description, url })
    if (keywords?.length) await sb.from('bookmarks').update({ keywords }).eq('id', data.id)
  } catch {
    // non-fatal: the row is saved, keywords are an enrichment
  }
  console.log(`  ✓ ${card_type.padEnd(10)} ${meta.image ? 'img' : 'NO-IMG'} ${title.slice(0, 54)}`)
  return { status: 'ok' as const, id: data.id as string }
}

async function main() {
  const userId = await ensureProfile()

  const { data: existingRows } = await sb
    .from('bookmarks')
    .select('url_key')
    .eq('user_id', userId)
  const seen = new Set((existingRows || []).map((r: any) => r.url_key).filter(Boolean))

  const furnIds: string[] = []
  let ok = 0, skipped = 0, failed = 0
  for (const l of LINKS) {
    const r = await seedBullet(userId, l.url, seen)
    if (r.status === 'ok') { ok++; if (l.furn && r.id) furnIds.push(r.id) }
    else if (r.status === 'skip') skipped++
    else if (r.status === 'fail') failed++
  }
  console.log(`\nbullets: ${ok} inserted · ${skipped} already there · ${failed} failed`)

  if (DRY) return

  // ── List ───────────────────────────────────────────────────────────
  let { data: list } = await sb
    .from('lists')
    .select('id')
    .eq('user_id', userId)
    .eq('name', LIST_NAME)
    .maybeSingle()
  if (!list) {
    const { data: created, error } = await sb
      .from('lists')
      .insert({ user_id: userId, name: LIST_NAME, slug: slugify(LIST_NAME), is_private: false })
      .select('id')
      .single()
    if (error) throw new Error(`list insert: ${error.message}`)
    list = created
  }
  if (furnIds.length) {
    const { error } = await sb
      .from('list_bookmarks')
      .upsert(furnIds.map((bookmark_id) => ({ list_id: list!.id, bookmark_id })), {
        onConflict: 'list_id,bookmark_id',
      })
    if (error) throw new Error(`list membership: ${error.message}`)
  }
  console.log(`list "${LIST_NAME}": ${furnIds.length} bullets → /${USERNAME}/${slugify(LIST_NAME)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
