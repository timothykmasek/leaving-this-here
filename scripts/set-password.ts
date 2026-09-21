// Set (or rotate) a password on an existing account via the admin API — the
// App Review demo account is the intended customer: invite.ts mints the
// account and profile, this gives it the password door the iOS sign-in
// screen hides behind the long-press. Regular members stay passwordless.
//
//   npx tsx scripts/set-password.ts --email reviewer@yourbulletin.com --password '…'

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

const EMAIL = arg('email')?.trim().toLowerCase()
const PASSWORD = arg('password')

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error('usage: npx tsx scripts/set-password.ts --email … --password …')
    process.exit(1)
  }
  if (PASSWORD.length < 10) {
    console.error('password too short — use 10+ characters')
    process.exit(1)
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // listUsers 500s on this project (long-standing) — resolve the id through
  // profiles instead: a profile's id IS the auth user id, and every invited
  // account has one. --username overrides when the email guess fails.
  const username = arg('username') ?? EMAIL.split('@')[0]
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, username')
    .eq('username', username)
    .single()
  if (profileErr || !profile) {
    console.error(`no profile "${username}" — run scripts/invite.ts first, or pass --username`)
    process.exit(1)
  }
  const userId = profile.id

  const { error } = await admin.auth.admin.updateUserById(userId, { password: PASSWORD })
  if (error) throw error
  console.log(`password set for ${EMAIL} (${userId})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
