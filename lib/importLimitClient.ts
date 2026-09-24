// Client side of the free import allowance (see lib/importQuota.ts). Shared by
// the dock's Bulk Import and the /import page so both doors enforce the same
// rule: pre-check the whole batch, run nothing if it doesn't fit.

export type ImportCheck = { fits: boolean; newCount: number; remaining: number }

/**
 * Ask whether this batch fits. Fails OPEN on a network/server error: the
 * per-link backstop in /api/import still stops the run at the limit, and a
 * flaky check shouldn't block someone who's well inside their allowance.
 */
export async function checkImport(urls: string[]): Promise<ImportCheck> {
  try {
    const res = await fetch('/api/import/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    })
    if (res.ok) return await res.json()
  } catch {}
  return { fits: true, newCount: urls.length, remaining: Infinity }
}

/** "Upgrade to Pro": emails Tim who asked. Never throws. */
export async function requestUpgrade(context: string): Promise<void> {
  try {
    await fetch('/api/upgrade-interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context }),
    })
  } catch {}
}

export function importsLeftLabel(remaining: number): string {
  return `You have ${remaining} import${remaining === 1 ? '' : 's'} left`
}

export function limitContext(newCount: number, remaining: number): string {
  return `import of ${newCount} new links, ${remaining} left`
}
