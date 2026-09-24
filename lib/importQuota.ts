import type { SupabaseClient } from '@supabase/supabase-js'

// The free import allowance: 500 imported links per account, lifetime.
//
// Everyday saves (extension, iOS, a single "Add Bullet") never count — only
// rows a bulk import run created (source = 'import'). Imports are the one save
// path that can cost real money in one sitting (a 5,000-link switcher is ~$40
// of screenshots), so they're what's metered; saving stays unlimited.
//
// Product rules (Tim, 2026-09-24):
//   - No counter or upgrade copy anywhere until an import doesn't fit.
//   - An import that doesn't fit is blocked WHOLE — nothing imports, no partial
//     run. The block shows how many links are left + "Upgrade to Pro".
export const IMPORT_LIMIT = 500

export type SaveSource = 'extension' | 'ios' | 'web' | 'import' | 'onboarding' | 'claude'

/** How many links this account has already brought in through imports. */
export async function importedCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from('bookmarks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source', 'import')
  return count ?? 0
}

/** Imports left on the free allowance (never negative). */
export async function importsRemaining(supabase: SupabaseClient, userId: string): Promise<number> {
  return Math.max(0, IMPORT_LIMIT - (await importedCount(supabase, userId)))
}
