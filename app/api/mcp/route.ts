import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { embed } from '@/lib/embed'
import { SITE_URL } from '@/lib/meta'

// MCP server — Bulletin as a Claude connector (yourbulletin.com/mcp).
//
// Streamable-HTTP transport, stateless: every request is a self-contained
// JSON-RPC POST answered with JSON. No session ids, no SSE stream, no state
// between calls — which is exactly the shape a Vercel function wants, and the
// spec allows a server to answer each POST with a plain JSON body instead of
// opening a stream.
//
// Auth is optional and mirrors /api/extension/*: a Supabase access token as a
// bearer header scopes the caller to their own account (private bullets, no
// username needed). Without one, the connector serves public data only —
// published profiles and lists — which is what makes it addable on claude.ai,
// where custom connectors can't carry custom headers.

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']

// Same gates as /api/search: queries are short by nature, embeds cost Voyage
// quota, and the relative cutoff self-calibrates across query lengths (see
// that route for the measurements behind the constants).
const MAX_QUERY_CHARS = 500
const ABSOLUTE_FLOOR = 0.18
const RELATIVE_CUTOFF = 0.62
const CANDIDATE_COUNT = 120
const SEARCH_RESULT_COUNT = 20

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id',
  'Access-Control-Max-Age': '86400',
}

function sb(token?: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}

type Caller = { userId: string; username: string | null } | null

async function resolveCaller(request: NextRequest, supabase: SupabaseClient): Promise<Caller> {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return null
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  return { userId: user.id, username: profile?.username ?? null }
}

// ── Tools ────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'search_bullets',
    description:
      "Semantic search over a Bulletin profile's saved links (bullets). Finds bullets by meaning, not just keywords — use it to answer things like \"that piece about pricing psychology\". `username` targets any public Bulletin; authenticated callers may omit it to search their own bullets, private ones included.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for, in natural language.' },
        username: { type: 'string', description: 'Bulletin username to search. Optional when authenticated (defaults to your own).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'recent_bullets',
    description:
      "A Bulletin profile's most recently saved links, newest first. Authenticated callers may omit `username` for their own saves.",
    inputSchema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Bulletin username. Optional when authenticated.' },
        limit: { type: 'number', description: 'Max bullets to return (default 20, max 50).' },
      },
    },
  },
  {
    name: 'get_lists',
    description:
      "A Bulletin profile's published lists — name, slug, description, and size. Lists are curated, purpose-driven collections; fetch one in full with get_list.",
    inputSchema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Bulletin username. Optional when authenticated.' },
      },
    },
  },
  {
    name: 'get_list',
    description:
      'One published Bulletin list in full: its description and every bullet in it (title, url, note). Use for "summarize my reading list" or reading a curator\'s list someone follows.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: "The list's slug, from get_lists or its yourbulletin.com/username/slug URL." },
        username: { type: 'string', description: 'The list owner. Optional when authenticated (defaults to your own).' },
      },
      required: ['slug'],
    },
  },
]

class ToolError extends Error {}

// Resolve the target profile for a tool call: an explicit username, else the
// authenticated caller's own.
async function targetProfile(
  supabase: SupabaseClient,
  caller: Caller,
  username?: string,
): Promise<{ id: string; username: string; display_name: string | null; bio: string | null; isOwner: boolean }> {
  const name = (username || caller?.username || '').trim()
  if (!name) {
    throw new ToolError(
      'No username given. Pass `username`, or connect with a Bulletin token to default to your own profile.',
    )
  }
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, bio')
    .eq('username', name)
    .single()
  if (!data) throw new ToolError(`No Bulletin profile named "${name}".`)
  return { ...data, isOwner: caller?.userId === data.id }
}

type BulletRow = {
  url: string
  title: string | null
  note?: string | null
  created_at?: string
  similarity?: number
}

function bullet(row: BulletRow) {
  return {
    title: row.title || row.url,
    url: row.url,
    ...(row.note ? { note: row.note } : {}),
    ...(row.created_at ? { saved: row.created_at.slice(0, 10) } : {}),
    ...(typeof row.similarity === 'number' ? { similarity: Number(row.similarity.toFixed(3)) } : {}),
  }
}

async function callTool(name: string, args: any, caller: Caller, supabase: SupabaseClient) {
  switch (name) {
    case 'search_bullets': {
      const query = typeof args?.query === 'string' ? args.query.trim().slice(0, MAX_QUERY_CHARS) : ''
      if (!query) throw new ToolError('`query` is required.')
      const profile = await targetProfile(supabase, caller, args?.username)
      const [vector] = await embed([query], 'query')
      const { data, error } = await supabase.rpc('match_bookmarks', {
        // pgvector params ride as string literals — raw JS arrays silently fail.
        query_embedding: `[${vector.join(',')}]` as any,
        target_user_id: profile.id,
        include_private: profile.isOwner,
        match_threshold: ABSOLUTE_FLOOR,
        match_count: CANDIDATE_COUNT,
      })
      if (error) throw new ToolError(`search failed: ${error.message}`)
      const rows = (data || []) as (BulletRow & { similarity: number })[]
      const top = rows[0]?.similarity ?? 0
      const cutoff = Math.max(ABSOLUTE_FLOOR, top * RELATIVE_CUTOFF)
      const hits = rows.filter((r) => r.similarity >= cutoff).slice(0, SEARCH_RESULT_COUNT)
      return {
        profile: profile.username,
        query,
        results: hits.map(bullet),
      }
    }

    case 'recent_bullets': {
      const profile = await targetProfile(supabase, caller, args?.username)
      const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 50)
      let q = supabase
        .from('bookmarks')
        .select('url, title, note, created_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(limit)
      // RLS already hides private bullets from anonymous callers; the explicit
      // filter keeps a signed-in caller browsing SOMEONE ELSE'S profile honest.
      if (!profile.isOwner) q = q.eq('is_private', false)
      const { data, error } = await q
      if (error) throw new ToolError(error.message)
      return { profile: profile.username, bullets: (data || []).map(bullet) }
    }

    case 'get_lists': {
      const profile = await targetProfile(supabase, caller, args?.username)
      let q = supabase
        .from('lists')
        .select('name, slug, description, is_private, list_bookmarks(bookmark_id)')
        .eq('user_id', profile.id)
      if (!profile.isOwner) q = q.eq('is_private', false)
      const { data, error } = await q
      if (error) throw new ToolError(error.message)
      return {
        profile: profile.username,
        ...(profile.bio ? { bio: profile.bio } : {}),
        lists: (data || []).map((l: any) => ({
          name: l.name,
          slug: l.slug,
          ...(l.description ? { description: l.description } : {}),
          bullets: l.list_bookmarks?.length ?? 0,
          url: `${SITE_URL}/${profile.username}/${l.slug}`,
        })),
      }
    }

    case 'get_list': {
      const slug = typeof args?.slug === 'string' ? args.slug.trim() : ''
      if (!slug) throw new ToolError('`slug` is required.')
      const profile = await targetProfile(supabase, caller, args?.username)
      let q = supabase
        .from('lists')
        .select('id, name, slug, description, is_private')
        .eq('user_id', profile.id)
        .eq('slug', slug)
      if (!profile.isOwner) q = q.eq('is_private', false)
      const { data: list, error } = await q.single()
      if (error || !list) {
        throw new ToolError(`No list "${slug}" on ${profile.username}'s Bulletin.`)
      }
      const { data: members, error: memberErr } = await supabase
        .from('list_bookmarks')
        .select('added_at, bookmarks(url, title, note, created_at, is_private)')
        .eq('list_id', list.id)
        .order('added_at', { ascending: false })
      if (memberErr) throw new ToolError(memberErr.message)
      const bullets = (members || [])
        .map((m: any) => m.bookmarks)
        .filter((b: any) => b && (profile.isOwner || !b.is_private))
      return {
        profile: profile.username,
        list: {
          name: list.name,
          ...(list.description ? { description: list.description } : {}),
          url: `${SITE_URL}/${profile.username}/${list.slug}`,
          bullets: bullets.map(bullet),
        },
      }
    }

    default:
      throw new ToolError(`Unknown tool: ${name}`)
  }
}

// ── JSON-RPC plumbing ────────────────────────────────────────────────────────

function rpcResult(id: any, result: any) {
  return { jsonrpc: '2.0', id, result }
}

function rpcError(id: any, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

async function handleMessage(msg: any, caller: Caller, supabase: SupabaseClient) {
  const { id, method, params } = msg || {}

  // Notifications (no id) expect no response.
  if (id === undefined || id === null) return null

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'bulletin', title: 'Bulletin', version: '0.1.0' },
        instructions:
          'Bulletin is a place people save and publish the links worth keeping ("bullets", organized into lists). Use search_bullets when the user refers to something they saved, and get_lists/get_list to read a profile\'s curated lists. Public profiles need a `username`; an authenticated connection defaults to its own account.',
      })
    }
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS })
    case 'tools/call': {
      try {
        const result = await callTool(params?.name, params?.arguments ?? {}, caller, supabase)
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        })
      } catch (err: any) {
        // Tool failures are results, not protocol errors — the model reads them.
        return rpcResult(id, {
          content: [{ type: 'text', text: err instanceof ToolError ? err.message : `Bulletin error: ${err.message}` }],
          isError: true,
        })
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${method}`)
  }
}

export async function POST(request: NextRequest) {
  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(rpcError(null, -32700, 'Parse error'), { status: 400, headers: CORS_HEADERS })
  }

  const supabase = sb()
  const caller = await resolveCaller(request, supabase)
  // Reads run through a token-scoped client when authed, so RLS sees the caller.
  const authHeader = request.headers.get('authorization') || ''
  const scoped = caller ? sb(authHeader.slice(7).trim()) : supabase

  const messages = Array.isArray(body) ? body : [body]
  const responses = (
    await Promise.all(messages.map((m) => handleMessage(m, caller, scoped)))
  ).filter(Boolean)

  // All notifications → 202 with no body, per streamable HTTP.
  if (responses.length === 0) {
    return new NextResponse(null, { status: 202, headers: CORS_HEADERS })
  }

  return NextResponse.json(Array.isArray(body) ? responses : responses[0], {
    headers: CORS_HEADERS,
  })
}

// No server-initiated stream: stateless servers respond 405 to GET per spec.
export async function GET() {
  return new NextResponse(null, { status: 405, headers: CORS_HEADERS })
}

// Session termination is a no-op — there are no sessions.
export async function DELETE() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}
