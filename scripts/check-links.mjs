// Fail the build on internal links that reload the whole app.
//
// <a href="/tim"> throws away the running React app and re-downloads everything
// — a full page load where <Link href="/tim"> would have been a transition. It
// looks identical in a screenshot, works perfectly when clicked, and is only
// visible as "why did that feel so slow". That combination is why it keeps
// coming back, and why it's worth a machine watching for it.
//
// Deliberately literal-only: it flags href="/..." written as a string in the
// source. It cannot see href={someVariable}, so a computed internal link slips
// through. That's the accepted trade — the alternative is guessing at runtime
// values and crying wolf, and a check that nags gets switched off.
//
// Legitimate anchors are left alone:
//   target=...    opening a new tab genuinely wants a real navigation
//   download      a download is not a route transition
//   href="//..."  protocol-relative, i.e. another origin
//   href="#..."   same-page anchor
//
//   node scripts/check-links.mjs

import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

const ROOTS = ['app', 'components', 'lib']
const EXTS = /\.tsx?$/

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (EXTS.test(entry)) out.push(path)
  }
  return out
}

const offenders = []

for (const file of ROOTS.flatMap((r) => walk(r))) {
  const src = readFileSync(file, 'utf8')
  // Opening <a> tags, attributes possibly spread over several lines.
  for (const match of src.matchAll(/<a\s[^>]*?>/gs)) {
    const tag = match[0]
    const href = tag.match(/href="([^"]*)"/)
    if (!href) continue
    const value = href[1]
    if (!value.startsWith('/') || value.startsWith('//')) continue
    if (/\starget=/.test(tag) || /\sdownload[\s=>]/.test(tag)) continue
    // 1-indexed line of the tag, for a clickable file:line
    const line = src.slice(0, match.index).split('\n').length
    offenders.push({ file, line, value })
  }
}

if (!offenders.length) {
  console.log('✓ no internal links that would reload the app')
  process.exit(0)
}

console.error(`\n✕ ${offenders.length} internal link${offenders.length > 1 ? 's' : ''} would reload the whole app:\n`)
for (const o of offenders) console.error(`   ${o.file}:${o.line}  <a href="${o.value}">`)
console.error(`
Use next/link instead, so the app transitions rather than reloading:

   import Link from 'next/link'
   <Link href="${offenders[0].value}">…</Link>

If a real navigation is genuinely wanted, add target= or download and this
check will step aside.
`)
process.exit(1)
