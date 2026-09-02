// Invite someone to the private beta — the "you build it" step of the flow.
//
// Pre-creates their account (their real email, NO password, pre-confirmed) so
// Google sign-in auto-links to it, builds their profile, and seeds their first
// links through the real save pipeline (lib/metadata → classifyCardType →
// normalizeUrl → insert → enrichKeywords) so the cards are indistinguishable
// from organic saves. Embeddings are left NULL; the nightly
// /api/backfill-embeddings sweep fills them in. Generalized from seed-remi.ts.
//
// With "Allow new users to sign up" OFF in Supabase, this script is the guest
// list: the admin API bypasses the toggle, so an account existing here is what
// "granted access" means.
//
//   npx tsx scripts/invite.ts --email jane@gmail.com --username jane --dry-run
//   npx tsx scripts/invite.ts --email jane@gmail.com --username jane \
//     --name "Jane Doe" --bio "…" --links jane-links.txt --list "Desk Research"
//
// --links     file with one URL per line (blank lines and #comments ignored)
// --list      public list to put ALL seeded links in (created if missing)
//
// The invite email needs no special link: /login's two lanes are both live
// (Google, or a self-serve emailed sign-in link). Admin-generated magic links
// (generateLink action_link) were cut — that path was never proven end-to-end
// and the self-serve lane is.
//
// Idempotent: an email that already has an account is reused, an existing
// profile is updated (username must be theirs or free), already-saved urls
// are skipped.

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

// ── args ─────────────────────────────────────────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}
const DRY = process.argv.includes('--dry-run')

const EMAIL = arg('email')?.trim().toLowerCase()
const USERNAME = arg('username')?.trim().toLowerCase()
const DISPLAY = arg('name') ?? (USERNAME ? USERNAME[0].toUpperCase() + USERNAME.slice(1) : '')
const BIO = arg('bio') ?? null
const LINKS_FILE = arg('links')
const LIST_NAME = arg('list')

if (!EMAIL || !USERNAME) {
  console.error('usage: npx tsx scripts/invite.ts --email <email> --username <username> [--name] [--bio] [--links file] [--list name] [--magic-link] [--dry-run]')
  process.exit(1)
}
if (!/^[a-z0-9][a-z0-9-_]{1,28}[a-z0-9]$/.test(USERNAME)) {
  console.error(`username "${USERNAME}" doesn't look right (lowercase letters/digits/-/_ , 3–30 chars)`)
  process.exit(1)
}

const links: string[] = LINKS_FILE
  ? fs
      .readFileSync(LINKS_FILE, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  : []

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── account ──────────────────────────────────────────────────────────
async function ensureUser(): Promise<string> {
  if (DRY) {
    console.log(`— would create auth user for ${EMAIL} (no password, pre-confirmed)`)
    return '00000000-0000-0000-0000-000000000000'
  }
  // No password: the account can only be entered via Google auto-link or an
  // admin-generated magic link. email_confirm makes the email "verified",
  // which is what lets Supabase link a matching Google identity to it.
  const { data, error } = await sb.auth.admin.createUser({ email: EMAIL!, email_confirm: true })
  if (!error) {
    console.log(`✓ created account ${EMAIL} (${data.user!.id})`)
    return data.user!.id
  }
  if (!/already.*registered|already.*exists/i.test(error.message)) {
    throw new Error(`createUser: ${error.message}`)
  }
  // Existing account. admin.listUsers 500s on this project, so recover the id
  // via generateLink, which returns the user for an existing email.
  const { data: linkData, error: le } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email: EMAIL!,
  })
  if (le || !linkData.user) throw new Error(`existing account, but couldn't fetch it: ${le?.message}`)
  console.log(`✓ account ${EMAIL} already exists (${linkData.user.id}) — reusing`)
  return linkData.user.id
}

async function ensureProfile(userId: string) {
  const { data: taken } = await sb
    .from('profiles')
    .select('id')
    .eq('username', USERNAME)
    .maybeSingle()
  if (taken && taken.id !== userId) {
    throw new Error(`username @${USERNAME} is taken by another account (${taken.id})`)
  }
  if (DRY) {
    console.log(`— would ${taken ? 'update' : 'create'} profile @${USERNAME} ("${DISPLAY}")`)
    return
  }
  const { data: existing } = await sb.from('profiles').select('id, username').eq('id', userId).maybeSingle()
  if (existing) {
    const patch: Record<string, unknown> = { username: USERNAME, display_name: DISPLAY }
    if (BIO !== null) patch.bio = BIO
    const { error } = await sb.from('profiles').update(patch).eq('id', userId)
    if (error) throw new Error(`profile update: ${error.message}`)
    console.log(`✓ profile @${USERNAME} updated${existing.username !== USERNAME ? ` (was @${existing.username})` : ''}`)
  } else {
    const { error } = await sb
      .from('profiles')
      .insert({ id: userId, username: USERNAME, display_name: DISPLAY, bio: BIO })
    if (error) throw new Error(`profile insert: ${error.message}`)
    console.log(`✓ profile @${USERNAME} created`)
  }
}

// ── links (same pipeline as seed-remi / the save routes) ─────────────
async function seedBullet(userId: string, url: string, seen: Set<string>) {
  const key = normalizeUrl(url)
  if (seen.has(key)) {
    console.log(`  · already saved  ${url.slice(0, 60)}`)
    return { status: 'skip' as const, id: null }
  }

  const meta = await extractMetadata(url)
  const title = meta.title || url
  const card_type = classifyCardType(url, meta)
  if (DRY) {
    console.log(`  — ${card_type.padEnd(10)} ${meta.image ? 'img   ' : 'NO-IMG'} ${title.slice(0, 54)}`)
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

  try {
    const keywords = await enrichKeywords({ title, description: meta.description, url })
    if (keywords?.length) await sb.from('bookmarks').update({ keywords }).eq('id', data.id)
  } catch {
    // non-fatal: the row is saved, keywords are an enrichment
  }
  console.log(`  ✓ ${card_type.padEnd(10)} ${meta.image ? 'img   ' : 'NO-IMG'} ${title.slice(0, 54)}`)
  return { status: 'ok' as const, id: data.id as string }
}

async function main() {
  const userId = await ensureUser()
  await ensureProfile(userId)

  const savedIds: string[] = []
  if (links.length) {
    const { data: existingRows } = await sb.from('bookmarks').select('url_key').eq('user_id', userId)
    const seen = new Set((existingRows || []).map((r: any) => r.url_key).filter(Boolean))
    console.log(`\nseeding ${links.length} links:`)
    let ok = 0, skipped = 0, failed = 0
    for (const url of links) {
      const r = await seedBullet(userId, url, seen)
      if (r.status === 'ok' && r.id) { ok++; savedIds.push(r.id) }
      else if (r.status === 'skip') skipped++
      else if (r.status === 'fail') failed++
    }
    console.log(`bullets: ${ok} inserted · ${skipped} already there · ${failed} failed`)
  }

  if (LIST_NAME && !DRY) {
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
    if (savedIds.length) {
      const { error } = await sb
        .from('list_bookmarks')
        .upsert(savedIds.map((bookmark_id) => ({ list_id: list!.id, bookmark_id })), {
          onConflict: 'list_id,bookmark_id',
        })
      if (error) throw new Error(`list membership: ${error.message}`)
    }
    console.log(`list "${LIST_NAME}": ${savedIds.length} bullets → /${USERNAME}/${slugify(LIST_NAME)}`)
  } else if (LIST_NAME && DRY) {
    console.log(`— would file ${links.length} links into list "${LIST_NAME}"`)
  }

  if (!DRY) {
    console.log(`\ndone. their page: https://www.yourbulletin.com/${USERNAME}`)
    console.log(`they sign in at https://www.yourbulletin.com/login — Google (${EMAIL}),`)
    console.log(`or they type that email there and get a sign-in link.`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
