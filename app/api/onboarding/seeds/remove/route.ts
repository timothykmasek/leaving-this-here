import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

// Dev-only: deletes seed links from lib/seedLibrary.ts by URL, for the review
// board at /preview/seeds. Rewrites the source file (one seed per line), so it
// can never run in production. Undo with `git checkout lib/seedLibrary.ts`.
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') return new NextResponse(null, { status: 404 })

  const { urls } = (await req.json().catch(() => ({}))) as { urls?: unknown }
  if (!Array.isArray(urls) || !urls.every((u) => typeof u === 'string'))
    return NextResponse.json({ error: 'urls must be a string[]' }, { status: 400 })

  const file = path.join(process.cwd(), 'lib/seedLibrary.ts')
  const src = await fs.readFile(file, 'utf8')
  const drop = new Set(urls.map((u) => `url: '${u}',`))
  const kept: string[] = []
  let removed = 0
  for (const line of src.split('\n')) {
    const isSeed = line.trimStart().startsWith('{ title:')
    if (isSeed && [...drop].some((d) => line.includes(d))) removed++
    else kept.push(line)
  }
  if (removed) await fs.writeFile(file, kept.join('\n'))
  return NextResponse.json({ removed })
}
