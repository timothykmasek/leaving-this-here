// The "9:23 AM GMT+8, 08.24.26" stamp used by the profile's "Latest Bullet"
// line and the list masthead's "Last Updated" line.
//
// MUST be called from the client (an effect, not render). It formats in the
// VIEWER's local timezone, so the server and the browser produce different
// strings for the same instant and React would report a hydration mismatch.
// Both call sites hold it in state that starts null and fills in on mount.
//
// Shared rather than copied because the two lines are meant to read as the same
// kind of fact in the same voice; two private copies of a date format drift.

/** e.g. "9:23 AM GMT+8, 08.24.26". Returns null for a missing/unparseable date. */
export function formatTimestampLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null

  const time = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const tz =
    new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName')?.value || ''
  const date = d
    .toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
    .replace(/\//g, '.')

  return `${time}${tz ? ` ${tz}` : ''}, ${date}`
}
