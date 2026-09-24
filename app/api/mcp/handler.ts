import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { embed } from '@/lib/embed'
import { SITE_URL } from '@/lib/meta'
import { normalizeUrl } from '@/lib/normalizeUrl'

// MCP server — Bulletin as a Claude connector, mounted twice:
//
//   /mcp     public: anonymous, no auth ever demanded. Published profiles and
//            lists only. What makes "read any curator's bulletin" addable with
//            zero setup.
//   /mcp/me  personal: no token → 401 + WWW-Authenticate, which is what tells
//            an MCP client to run the OAuth flow (Supabase is the
//            authorization server; consent screen at /oauth/consent). With a
//            token, every tool defaults to the caller's own account, private
//            bullets included.
//
// Streamable-HTTP transport, stateless: every request is a self-contained
// JSON-RPC POST answered with JSON. No session ids, no SSE stream, no state
// between calls — which is exactly the shape a Vercel function wants, and the
// spec allows a server to answer each POST with a plain JSON body instead of
// opening a stream.
//
// Token validation mirrors /api/extension/*: OAuth access tokens minted by
// Supabase's OAuth server verify with the same auth.getUser() as session
// tokens, so one bearer path serves both.

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
  'Access-Control-Expose-Headers': 'WWW-Authenticate',
  'Access-Control-Max-Age': '86400',
}

// RFC 9728: the 401 names where the resource's metadata lives, the metadata
// names the authorization server, and the client takes it from there.
export const PERSONAL_RESOURCE = `${SITE_URL}/mcp/me`
export const PERSONAL_METADATA_URL = `${SITE_URL}/.well-known/oauth-protected-resource/mcp/me`

function unauthorized() {
  return new NextResponse(null, {
    status: 401,
    headers: {
      ...CORS_HEADERS,
      'WWW-Authenticate': `Bearer resource_metadata="${PERSONAL_METADATA_URL}"`,
    },
  })
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
      "Semantic search over a Bulletin profile's saved links (bullets). Finds bullets by meaning, not just keywords — use it to answer things like \"that piece about pricing psychology\". `username` targets any public Bulletin; authenticated callers may omit it to search their own bullets, unfiled (not-yet-published) ones included.",
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
      "A Bulletin profile's published lists — name, slug, and size. Lists are curated, purpose-driven collections; fetch one in full with get_list.",
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
      'One published Bulletin list in full: every bullet in it (title, url, note). Use for "summarize my reading list" or reading a curator\'s list someone follows.',
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

// Write tools — personal mount only. The contract with the model is
// preview-then-confirm: `preview_save` is the "show me first" step; the
// save tools say in their own descriptions that they run only after the
// user has confirmed the specific links. Writes go through the same
// /api/extension/* routes the Chrome extension and iOS app use (same
// bearer token — an OAuth access token verifies like a session token), so
// a link saved from a chat gets the identical pipeline: metadata,
// screenshot, Haiku keywords, embedding. Nothing here can delete.
const WRITE_TOOLS = [
  {
    name: 'preview_save',
    description:
      'The "show me first" step before saving. For each URL, reports whether it is already in the user\'s Bulletin (and which lists it sits in), plus which existing list name matches a proposed `list`. Call this, show the user the plan (which links, which list), and only call save_bullet after they confirm. Never save without that confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        urls: { type: 'array', items: { type: 'string' }, description: 'The links you propose to save (max 50).' },
        list: { type: 'string', description: 'Proposed list name to file them into, if any.' },
      },
      required: ['urls'],
    },
  },
  {
    name: 'save_bullet',
    description:
      "Save one link to the user's Bulletin, optionally filing it into a list (matched by name, case-insensitive; created if it doesn't exist). Runs Bulletin's full save pipeline. ONLY call this after preview_save and the user's explicit confirmation of these specific links — a batch of unwanted saves is hard to undo. Re-saving an existing link refreshes it rather than duplicating it.",
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The link to save.' },
        list: { type: 'string', description: 'List to file it into (name or slug). Optional.' },
        note: { type: 'string', description: "A short note in the user's words. Optional." },
      },
      required: ['url'],
    },
  },
  {
    name: 'add_to_list',
    description:
      "File an already-saved link into one of the user's lists (name or slug; created if missing). Use save_bullet instead when the link isn't in the Bulletin yet. Confirm with the user before bulk filing.",
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'A link already in the Bulletin.' },
        list: { type: 'string', description: 'List name or slug.' },
      },
      required: ['url', 'list'],
    },
  },
]

class ToolError extends Error {}

// Call our own extension API with the caller's token. Non-2xx becomes a
// ToolError the model can read; `already saved` is surfaced as data.
async function extApi(path: string, token: string, init: { method?: string; body?: any; query?: Record<string, string> } = {}) {
  const url = new URL(`${SITE_URL}${path}`)
  for (const [k, v] of Object.entries(init.query || {})) url.searchParams.set(k, v)
  const res = await fetch(url, {
    method: init.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (json?.alreadySaved) return { alreadySaved: true }
    throw new ToolError(json?.error || `${path} failed (${res.status})`)
  }
  return json
}

// Find a list by name or slug (case-insensitive) among the caller's lists.
function matchList(lists: { id: string; name: string; slug: string }[], wanted: string) {
  const w = wanted.trim().toLowerCase()
  return lists.find((l) => l.name.toLowerCase() === w || l.slug.toLowerCase() === w) || null
}

// Resolve or create the list, then file the bullet. Returns the list used.
async function fileInto(token: string, bookmarkId: string, listName: string) {
  const { lists } = await extApi('/api/extension/lists', token)
  const existing = matchList(lists || [], listName)
  if (existing) {
    await extApi('/api/extension/lists', token, { method: 'POST', body: { op: 'add', list_id: existing.id, bookmark_id: bookmarkId } })
    return { name: existing.name, slug: existing.slug, created: false }
  }
  const created = await extApi('/api/extension/lists', token, { method: 'POST', body: { op: 'create', name: listName.trim(), bookmark_id: bookmarkId } })
  return { name: created.list.name, slug: created.list.slug, created: !created.existed }
}

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

async function callTool(
  name: string,
  args: any,
  caller: Caller,
  supabase: SupabaseClient,
  token: string,
  personal: boolean,
) {
  const requireWriter = () => {
    if (!personal || !caller) {
      throw new ToolError('Saving requires the personal connector (yourbulletin.com/mcp/me), signed in.')
    }
  }

  switch (name) {
    case 'preview_save': {
      requireWriter()
      const urls: string[] = Array.isArray(args?.urls)
        ? args.urls.filter((u: any) => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, 50)
        : []
      if (urls.length === 0) throw new ToolError('`urls` must contain at least one http(s) link.')

      const keys = urls.map((u) => ({ url: u, key: normalizeUrl(u) }))
      const { data: existing } = await supabase
        .from('bookmarks')
        .select('url_key, url, title, list_bookmarks(lists(name))')
        .eq('user_id', caller!.userId)
        .in('url_key', keys.map((k) => k.key))
      const byKey = new Map((existing || []).map((b: any) => [b.url_key, b]))

      const { lists } = await extApi('/api/extension/lists', token)
      const wanted = typeof args?.list === 'string' && args.list.trim() ? args.list.trim() : null
      const match = wanted ? matchList(lists || [], wanted) : null

      return {
        list: wanted
          ? match
            ? { name: match.name, exists: true }
            : { name: wanted, exists: false, note: 'Will be created on save.' }
          : null,
        links: keys.map(({ url, key }) => {
          const hit: any = byKey.get(key)
          return hit
            ? {
                url,
                already_saved: true,
                title: hit.title,
                in_lists: (hit.list_bookmarks || []).map((m: any) => m.lists?.name).filter(Boolean),
              }
            : { url, already_saved: false }
        }),
        next: 'Show this plan to the user. Save only the links they confirm, one save_bullet call each.',
      }
    }

    case 'save_bullet': {
      requireWriter()
      const url = typeof args?.url === 'string' ? args.url.trim() : ''
      if (!/^https?:\/\//i.test(url)) throw new ToolError('`url` must be an http(s) link.')
      const body: Record<string, any> = { url, source: 'claude' }
      if (typeof args?.note === 'string' && args.note.trim()) body.note = args.note.trim()

      const saved = await extApi('/api/extension/save', token, { method: 'POST', body })
      if (saved.alreadySaved) return { url, saved: false, reason: 'already in the Bulletin (use add_to_list to file it)' }

      const bookmarkId = saved.bookmark?.id
      const listName = typeof args?.list === 'string' && args.list.trim() ? args.list : null
      const filed = listName && bookmarkId ? await fileInto(token, bookmarkId, listName) : null
      return {
        url,
        saved: true,
        refreshed: saved.refreshed === true,
        title: saved.bookmark?.title || null,
        ...(filed ? { list: filed } : {}),
        profile_url: saved.username ? `${SITE_URL}/${saved.username}` : undefined,
      }
    }

    case 'add_to_list': {
      requireWriter()
      const url = typeof args?.url === 'string' ? args.url.trim() : ''
      const listName = typeof args?.list === 'string' ? args.list.trim() : ''
      if (!url || !listName) throw new ToolError('`url` and `list` are required.')
      const { data: row } = await supabase
        .from('bookmarks')
        .select('id, title')
        .eq('user_id', caller!.userId)
        .eq('url_key', normalizeUrl(url))
        .maybeSingle()
      if (!row) throw new ToolError('That link is not in the Bulletin yet — use save_bullet.')
      const filed = await fileInto(token, row.id, listName)
      return { url, title: row.title, list: filed }
    }

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
      // Lists are always public (migration 028) — no owner/visitor split.
      const { data, error } = await supabase
        .from('lists')
        .select('name, slug, list_bookmarks(bookmark_id)')
        .eq('user_id', profile.id)
      if (error) throw new ToolError(error.message)
      return {
        profile: profile.username,
        ...(profile.bio ? { bio: profile.bio } : {}),
        lists: (data || []).map((l: any) => ({
          name: l.name,
          slug: l.slug,
          bullets: l.list_bookmarks?.length ?? 0,
          url: `${SITE_URL}/${profile.username}/${l.slug}`,
        })),
      }
    }

    case 'get_list': {
      const slug = typeof args?.slug === 'string' ? args.slug.trim() : ''
      if (!slug) throw new ToolError('`slug` is required.')
      const profile = await targetProfile(supabase, caller, args?.username)
      const { data: list, error } = await supabase
        .from('lists')
        .select('id, name, slug')
        .eq('user_id', profile.id)
        .eq('slug', slug)
        .single()
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

async function handleMessage(msg: any, caller: Caller, supabase: SupabaseClient, personal: boolean, token: string) {
  const { id, method, params } = msg || {}

  // Notifications (no id) expect no response.
  if (id === undefined || id === null) return null

  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: personal ? 'bulletin-me' : 'bulletin', title: 'Bulletin', version: '0.2.0' },
        instructions: personal
          ? `Bulletin is where this user saves and publishes the links worth keeping ("bullets", organized into lists). This connection is authenticated as ${caller?.username ? `@${caller.username}` : 'their account'}: every tool defaults to their own bullets (unfiled, not-yet-published ones included) when \`username\` is omitted. Use search_bullets when they refer to something they saved; pass a \`username\` only to read someone else's public bulletin. Saving: when asked to save or file links (e.g. "add the ecommerce links from this newsletter to my Ecommerce list"), extract the links, call preview_save, show the user the plan, and save with save_bullet ONLY the links they confirm. Never delete — there is no delete tool.`
          : 'Bulletin is a place people save and publish the links worth keeping ("bullets", organized into lists). Use search_bullets when the user refers to something they saved, and get_lists/get_list to read a profile\'s curated lists. Public profiles need a `username`; an authenticated connection defaults to its own account.',
      })
    }
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, { tools: personal ? [...TOOLS, ...WRITE_TOOLS] : TOOLS })
    case 'tools/call': {
      try {
        const result = await callTool(params?.name, params?.arguments ?? {}, caller, supabase, token, personal)
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

export function makeMcpRoutes({ personal }: { personal: boolean }) {
  return {
    POST: async (request: NextRequest) => {
      let body: any
      try {
        body = await request.json()
      } catch {
        return NextResponse.json(rpcError(null, -32700, 'Parse error'), { status: 400, headers: CORS_HEADERS })
      }

      const supabase = sb()
      const caller = await resolveCaller(request, supabase)
      // The personal mount challenges every tokenless request — that 401 is
      // the signal that starts an MCP client's OAuth flow.
      if (personal && !caller) return unauthorized()

      // Reads run through a token-scoped client when authed, so RLS sees the caller.
      const authHeader = request.headers.get('authorization') || ''
      const token = authHeader.slice(7).trim()
      const scoped = caller ? sb(token) : supabase

      const messages = Array.isArray(body) ? body : [body]
      const responses = (
        await Promise.all(messages.map((m) => handleMessage(m, caller, scoped, personal, token)))
      ).filter(Boolean)

      // All notifications → 202 with no body, per streamable HTTP.
      if (responses.length === 0) {
        return new NextResponse(null, { status: 202, headers: CORS_HEADERS })
      }

      return NextResponse.json(Array.isArray(body) ? responses : responses[0], {
        headers: CORS_HEADERS,
      })
    },

    // No server-initiated stream: stateless servers respond 405 to GET per
    // spec — but the personal mount challenges first, since some clients probe
    // with GET before POSTing.
    GET: async (request: NextRequest) => {
      if (personal && !(await resolveCaller(request, sb()))) return unauthorized()
      return new NextResponse(null, { status: 405, headers: CORS_HEADERS })
    },

    // Session termination is a no-op — there are no sessions.
    DELETE: async () => new NextResponse(null, { status: 200, headers: CORS_HEADERS }),

    OPTIONS: async () => new NextResponse(null, { status: 204, headers: CORS_HEADERS }),
  }
}
