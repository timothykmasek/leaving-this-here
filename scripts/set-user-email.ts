// Re-point an account's email — built for the demo personas (hugh/ellie),
// whose seeded @seed.leavingthishere.local addresses can't receive mail.
// Bulletin is passwordless (the ?pw=1 login lane is gone), so a persona is
// only reachable through /login's emailed sign-in link — which needs a real
// inbox. Plus-addressing (timothykmasek+hugh@gmail.com) gives each persona a
// deliverable address that all lands in Tim's gmail.
//
//   npx tsx scripts/set-user-email.ts --username hugh --dry-run
//   npx tsx scripts/set-user-email.ts --username hugh --email timothykmasek+hugh@gmail.com
//
// Looks the user up via profiles (auth.admin.listUsers 500s on this project),
// then updates the auth email pre-confirmed. Sign in afterwards by typing the
// new address into /login's email lane.

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split('\n') : []) {
  if (!line || line.startsWith('#')) continue
  const i = line.indexOf('=')
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : undefined
}
const DRY = process.argv.includes('--dry-run')
const USERNAME = arg('username')?.trim().toLowerCase()
const EMAIL = arg('email')?.trim().toLowerCase()

if (!USERNAME || (!EMAIL && !DRY)) {
  console.error('usage: npx tsx scripts/set-user-email.ts --username <username> --email <new-email> [--dry-run]')
  process.exit(1)
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

async function main() {
  const { data: profile, error: pErr } = await sb
    .from('profiles')
    .select('id, username, display_name')
    .eq('username', USERNAME)
    .single()
  if (pErr || !profile) {
    console.error(`no profile with username "${USERNAME}"${pErr ? ` (${pErr.message})` : ''}`)
    process.exit(1)
  }

  // getUserById 500s on the seeded persona rows (same GoTrue quirk as
  // listUsers — see project memory), so the current email is best-effort and
  // an unreadable row is not a reason to stop: the update itself may still go
  // through, and often repairs the row.
  const { data: current, error: gErr } = await sb.auth.admin.getUserById(profile.id)
  const currentEmail = current?.user?.email ?? `<unreadable: ${gErr?.message}>`

  console.log(`@${profile.username} (${profile.display_name ?? '—'}) — currently ${currentEmail}`)

  if (DRY) {
    console.log(EMAIL ? `— would set email to ${EMAIL}` : '— dry run, no --email given')
    return
  }

  const { error: uErr } = await sb.auth.admin.updateUserById(profile.id, {
    email: EMAIL!,
    email_confirm: true,
  })
  if (uErr) {
    console.error(`update failed: ${uErr.message}`)
    process.exit(1)
  }
  console.log(`✓ email set to ${EMAIL} (pre-confirmed)`)
  console.log(`sign in: type ${EMAIL} into the email lane at https://www.yourbulletin.com/login`)
}

main()
