import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SaveSource } from '@/lib/importQuota'

// Everyday save limits, per account, over a rolling 24 hours (Tim, 2026-09-24).
//
// Abuse protection, not a paywall: a real person never gets near these. The
// doors that can't bring their own screenshot (every save there is a paid
// ScreenshotOne capture) and are easy to script get tighter limits of their own:
//   - all everyday saves (extension, iOS, web, Claude): 100
//   - "Add Bullet" (web):  20 — also the door around the 500-link import cap
//   - Claude connector:    50 — room for "save the links from this newsletter"
// Imports have their own lifetime allowance (lib/importQuota); onboarding seeds
// and re-saves (which refresh an existing card) never count.
export const DAILY_LIMIT = 100
const DOOR_LIMITS: Partial<Record<SaveSource, { max: number; name: string; label: string }>> = {
  web: { max: 20, name: 'add_bullet_daily', label: 'links added by hand' },
  claude: { max: 50, name: 'claude_daily', label: 'saves through Claude' },
}
const EVERYDAY: SaveSource[] = ['extension', 'ios', 'web', 'claude']

// Tim's own accounts: his Gmail, its +aliases (the hugh/remi personas) and the
// seeded preview personas he curates by hand after seeding them by script.
function isExempt(email: string | null | undefined): boolean {
  const e = (email || '').toLowerCase()
  return /^timothykmasek(\+[^@]*)?@gmail\.com$/.test(e) || e.endsWith('@seed.bulletin.local')
}

export type LimitHit = { limit: string; message: string }

// `null` in `sources` matches rows with no recorded source: a caller that
// didn't identify itself (a script, say) gets counted, not waved through.
async function countSince(
  supabase: SupabaseClient,
  userId: string,
  sources: (SaveSource | null)[],
  since: string,
): Promise<number> {
  const named = sources.filter((s): s is SaveSource => !!s)
  const filters = [
    ...(named.length ? [`source.in.(${named.join(',')})`] : []),
    ...(sources.includes(null) ? ['source.is.null'] : []),
  ]
  const { count } = await supabase
    .from('bookmarks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .or(filters.join(','))
    .gte('created_at', since)
  return count ?? 0
}

/**
 * Would one more save through `door` go over a limit? Returns the hit (with a
 * message fit to show the person as-is) or null. Fails open: a count error
 * never blocks a save. Logs the hit (see logLimitHit).
 */
export async function checkSaveLimit(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  door: SaveSource | null,
): Promise<LimitHit | null> {
  if (isExempt(user.email)) return null
  const userId = user.id
  // Imports and onboarding seeds have their own rules. An unidentified caller
  // (door null) is held to the strictest per-door limit.
  if (door && !EVERYDAY.includes(door)) return null
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  try {
    const perDoor = DOOR_LIMITS[door ?? 'web']
    if (perDoor && (await countSince(supabase, userId, [door], since)) >= perDoor.max) {
      await logLimitHit(userId, door ?? 'unknown', perDoor.name)
      return {
        limit: perDoor.name,
        message: `You’ve hit today’s limit of ${perDoor.max} ${perDoor.label}. It resets tomorrow.`,
      }
    }
    if ((await countSince(supabase, userId, [...EVERYDAY, null], since)) >= DAILY_LIMIT) {
      await logLimitHit(userId, door ?? 'unknown', 'daily')
      return {
        limit: 'daily',
        message: `You’ve hit today’s limit of ${DAILY_LIMIT} saves. It resets tomorrow.`,
      }
    }
  } catch {}
  return null
}

/** Record a refused save/import in limit_hits (migration 032). Never throws. */
export async function logLimitHit(userId: string, door: string, limitName: string): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    await admin.from('limit_hits').insert({ user_id: userId, door, limit_name: limitName })
  } catch {}
}
