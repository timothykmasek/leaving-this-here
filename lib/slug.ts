// List slugs. Minted once from a list's name at creation, then frozen — the
// public URL /username/<slug> stays stable even when the list is renamed. Kept
// in one place so the web app and the extension produce identical slugs.

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'list'
}

// Slug that doesn't collide with the owner's existing slugs. Falls back to
// appending -2, -3, ... until free.
export function uniqueSlug(name: string, taken: string[]): string {
  const base = slugify(name)
  const used = new Set(taken)
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
