#!/usr/bin/env node
// Delete accounts from Supabase — profile, bullets, lists, follows, auth row.
//
// Dry-run by default. Nothing is deleted unless you pass --live.
//
//   --list             show every account (username, bullets, lists, email) and exit
//   --live             actually delete (without this, it only prints the plan)
//   <usernames...>     the accounts to delete, space- or comma-separated
//
// Required env (in .env.local):
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY    (admin — bypasses RLS)
//
// Run from the repo root:
//   node scripts/delete-accounts.mjs --list             # who's there?
//   node scripts/delete-accounts.mjs jim testering      # preview the delete
//   node scripts/delete-accounts.mjs jim testering --live
//
// Why this exists: `auth.admin.listUsers` 500s on this project ("Database error
// finding users"), so accounts are enumerated via the `profiles` table instead
// (profile.id === auth.users.id). Auth rows with no profile are invisible here —
// use the Supabase dashboard Auth tab for those.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// Accounts this script will never delete, whatever you pass it. `tim` is the
// real account (~1.1k bullets); everything else is seeded or disposable.
const PROTECTED = ['tim']

// Deleting a profile cascades to these (declared `on delete cascade` in
// migrations 006/008/013), so we don't touch them directly.
const CASCADES = ['lists', 'shelf_dismissals', 'folio_subscribers']

// Order matters. `bookmarks` and `follows` are NOT known to cascade — 001_init.sql
// is a stub (the schema was run in the Supabase SQL editor), so the FK rules
// aren't in the repo. Delete them explicitly rather than trust a cascade we
// can't see. Profiles last, then the auth row.
const EXPLICIT = [
  ['bookmarks', 'user_id'],
  ['follows', 'follower_id'],
  ['follows', 'following_id'],
  ['profiles', 'id'],
]

// ── Args ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (k) => args.includes(k)

const LIST = flag('--list')
const LIVE = flag('--live')
const USERNAMES = args
  .filter((a) => !a.startsWith('--'))
  .flatMap((a) => a.split(','))
  .map((a) => a.trim())
  .filter(Boolean)

if (!LIST && USERNAMES.length === 0) {
  console.error('usage: node scripts/delete-accounts.mjs [--list] [--live] <username...>')
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

if (!SUPABASE_URL) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL in .env.local')
  process.exit(1)
}
if (!SERVICE_KEY) {
  console.error('missing SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── Helpers ──────────────────────────────────────────────────────────
async function countFor(table, col, id) {
  const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq(col, id)
  return count ?? 0
}

async function describe(profile) {
  const [bullets, lists] = await Promise.all([
    countFor('bookmarks', 'user_id', profile.id),
    countFor('lists', 'user_id', profile.id),
  ])
  const { data } = await sb.auth.admin.getUserById(profile.id)
  return {
    ...profile,
    bullets,
    lists,
    email: data?.user?.email ?? '(no auth row)',
    lastSignIn: data?.user?.last_sign_in_at?.slice(0, 10) ?? '—',
  }
}

function row(a) {
  return (
    `  ${String(a.username ?? '(none)').padEnd(14)}` +
    `${String(a.bullets).padStart(5)} bullets` +
    `${String(a.lists).padStart(4)} lists   ` +
    `created ${String(a.created_at).slice(0, 10)}  ` +
    `last-in ${a.lastSignIn.padEnd(11)}${a.email}`
  )
}

// ── --list ───────────────────────────────────────────────────────────
if (LIST) {
  const { data, error } = await sb.from('profiles').select('*').order('created_at')
  if (error) {
    console.error('profiles:', error.message)
    process.exit(1)
  }
  console.log(`${data.length} accounts\n`)
  for (const p of data) console.log(row(await describe(p)))
  process.exit(0)
}

// ── Resolve ──────────────────────────────────────────────────────────
const { data: found, error } = await sb.from('profiles').select('id, username, created_at').in('username', USERNAMES)
if (error) {
  console.error('profiles:', error.message)
  process.exit(1)
}

const missing = USERNAMES.filter((u) => !found.some((f) => f.username === u))
if (missing.length) {
  console.error(`no profile for: ${missing.join(', ')}`)
  console.error('(run with --list to see what exists — nothing was deleted)')
  process.exit(1)
}

const blocked = found.filter((f) => PROTECTED.includes(f.username))
if (blocked.length) {
  console.error(`refusing to delete protected account(s): ${blocked.map((b) => b.username).join(', ')}`)
  console.error('(edit PROTECTED in this script if you really mean it — nothing was deleted)')
  process.exit(1)
}

// ── Plan ─────────────────────────────────────────────────────────────
const targets = []
for (const f of found) targets.push(await describe(f))

console.log(LIVE ? '=== LIVE — deleting ===\n' : '=== DRY RUN — nothing will be deleted ===\n')
for (const t of targets) console.log(row(t))

const totalBullets = targets.reduce((n, t) => n + t.bullets, 0)
const totalLists = targets.reduce((n, t) => n + t.lists, 0)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
console.log(`\n${plural(targets.length, 'account')} · ${plural(totalBullets, 'bullet')} · ${plural(totalLists, 'list')}`)

// Anything with real content is worth a second look — test accounts are small.
const chunky = targets.filter((t) => t.bullets >= 10)
if (chunky.length) {
  console.log(`\n⚠️  these carry real content: ${chunky.map((t) => `${t.username} (${t.bullets})`).join(', ')}`)
}

if (!LIVE) {
  console.log('\nre-run with --live to apply')
  process.exit(0)
}

// ── Delete ───────────────────────────────────────────────────────────
console.log(`\n(${CASCADES.join(', ')} cascade from profiles)\n`)

for (const t of targets) {
  for (const [table, col] of EXPLICIT) {
    const { error: e } = await sb.from(table).delete().eq(col, t.id)
    if (e) console.error(`  ${t.username} ${table}.${col}:`, e.message)
  }
  // Seeded personas have no auth row; deleteUser reports that rather than
  // succeeding. The profile is gone either way, so it isn't a failure.
  const { error: ea } = await sb.auth.admin.deleteUser(t.id)
  const noAuthRow = ea && /not found|error loading user/i.test(ea.message)
  if (ea && !noAuthRow) console.error(`  ${t.username} auth:`, ea.message)
  console.log(`  deleted ${t.username}${noAuthRow ? ' (profile only — had no auth row)' : ''}`)
}

// ── Verify ───────────────────────────────────────────────────────────
const { data: left } = await sb.from('profiles').select('id, username').order('created_at')
console.log(`\nremaining: ${left.map((p) => p.username).join(', ')}`)

const ids = left.map((p) => p.id)
for (const table of ['bookmarks', 'lists']) {
  const { count: total } = await sb.from(table).select('*', { count: 'exact', head: true })
  const { count: orphaned } = await sb
    .from(table)
    .select('*', { count: 'exact', head: true })
    .not('user_id', 'in', `(${ids.join(',')})`)
  const warn = (orphaned ?? 0) > 0 ? '  ⚠️' : ''
  console.log(`${table}: ${total} total, ${orphaned ?? 0} orphaned${warn}`)
}
