// Auth + API helpers, shared by the popup and the background worker.
//
// Sign-in uses Supabase's GoTrue OAuth endpoint with Chrome's
// `launchWebAuthFlow`. We deliberately do NOT bundle supabase-js — hitting
// /auth/v1/authorize WITHOUT a PKCE code_challenge makes Supabase use the
// implicit grant, so the final redirect lands on our chromiumapp.org URL with
// `#access_token=...&refresh_token=...` in the fragment. We parse that and
// stash the tokens in chrome.storage.local. Keeps the extension buildless.

import { CONFIG } from './config.js'

const STORAGE_KEY = 'ig_session'

export function getRedirectUri() {
  // e.g. https://<extension-id>.chromiumapp.org/
  return chrome.identity.getRedirectURL()
}

export async function getSession() {
  const { [STORAGE_KEY]: session } = await chrome.storage.local.get(STORAGE_KEY)
  return session || null
}

async function setSession(session) {
  await chrome.storage.local.set({ [STORAGE_KEY]: session })
}

export async function signOut() {
  await chrome.storage.local.remove(STORAGE_KEY)
}

// Kick off the Google OAuth flow and persist the resulting tokens.
export async function signIn() {
  const redirectUri = getRedirectUri()
  const authUrl =
    `${CONFIG.SUPABASE_URL}/auth/v1/authorize` +
    `?provider=google&redirect_to=${encodeURIComponent(redirectUri)}`

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  })

  // Supabase puts tokens in the URL fragment on the implicit flow.
  const hash = new URL(responseUrl).hash.slice(1)
  const params = new URLSearchParams(hash)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  const expires_at = params.get('expires_at')

  if (!access_token || !refresh_token) {
    // Surface a Supabase-side error if one came back instead.
    const err = params.get('error_description') || params.get('error') || 'no token returned'
    throw new Error(decodeURIComponent(err))
  }

  const session = {
    access_token,
    refresh_token,
    // expires_at is unix seconds; fall back to 1h if absent.
    expires_at: expires_at ? Number(expires_at) : Math.floor(Date.now() / 1000) + 3600,
  }
  await setSession(session)
  return session
}

// Error thrown when the session can't be refreshed and the user must sign in
// again. Callers (background worker) use this to restore the sign-in popup.
export class AuthExpiredError extends Error {
  constructor(message) {
    super(message || 'session expired — please sign in again')
    this.name = 'AuthExpiredError'
    this.authExpired = true
  }
}

// Coalesce concurrent refreshes. Supabase rotates refresh tokens and they're
// single-use, so two parallel saves that both hit expiry would race to spend
// the same token — the loser gets "Refresh Token Not Found" and the session
// dies needlessly. Sharing one in-flight refresh makes the second caller await
// the first's result instead of issuing a doomed second exchange.
let inFlightRefresh = null

function refresh(session) {
  if (inFlightRefresh) return inFlightRefresh
  inFlightRefresh = doRefresh(session).finally(() => {
    inFlightRefresh = null
  })
  return inFlightRefresh
}

// Exchange a refresh token for a fresh access token.
async function doRefresh(session) {
  const res = await fetch(
    `${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    }
  )
  if (!res.ok) {
    // The refresh token is dead (expired, revoked, or already rotated). Clear
    // the stored session so we don't get stuck retrying a token that can never
    // succeed — and so the next icon click reverts to the sign-in popup.
    const detail = await res.json().catch(() => ({}))
    await signOut()
    throw new AuthExpiredError(
      detail.error_description || detail.msg || 'session expired — please sign in again'
    )
  }
  const data = await res.json()
  const next = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
  }
  await setSession(next)
  return next
}

// Return a valid access token, refreshing if it's expired or near-expiry.
async function getValidAccessToken() {
  let session = await getSession()
  if (!session) throw new Error('not signed in')
  const skewSeconds = 60
  if (session.expires_at && session.expires_at - skewSeconds < Date.now() / 1000) {
    session = await refresh(session)
  }
  return session.access_token
}

// POST JSON to an extension API route with the bearer token, retrying once
// after a forced refresh if the token comes back rejected (401).
async function apiPost(path, payload) {
  const attempt = (token) =>
    fetch(`${CONFIG.API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

  const token = await getValidAccessToken()
  let res = await attempt(token)

  if (res.status === 401) {
    // Token rejected — force a refresh and retry once.
    const session = await getSession()
    if (session) {
      const next = await refresh(session)
      res = await attempt(next.access_token)
    }
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`)
  return data
}

// GET an extension API route with the bearer token, refreshing + retrying once
// on a 401. Mirrors apiPost for read-only calls.
async function apiGet(path) {
  const attempt = (token) =>
    fetch(`${CONFIG.API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

  const token = await getValidAccessToken()
  let res = await attempt(token)

  if (res.status === 401) {
    const session = await getSession()
    if (session) {
      const next = await refresh(session)
      res = await attempt(next.access_token)
    }
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`)
  return data
}

// Save a gem. `payload` = { url, title?, note?, image_url? }.
export async function saveGem(payload) {
  return apiPost('/api/extension/save', payload)
}

// ── Lists ───────────────────────────────────────────────────────────
// The signed-in user's lists: [{ id, name, slug }].
export async function getLists() {
  return apiGet('/api/extension/lists')
}

// Create a new (published) list and optionally add a gem to it. Returns
// { list: { id, name, slug }, url } — `url` is the live public page.
export async function createList(name, bookmarkId) {
  return apiPost('/api/extension/lists', { op: 'create', name, bookmark_id: bookmarkId })
}

// Add or remove a gem from an existing list.
export async function setListMembership(listId, bookmarkId, add) {
  return apiPost('/api/extension/lists', {
    op: add ? 'add' : 'remove',
    list_id: listId,
    bookmark_id: bookmarkId,
  })
}

// The signed-in user's most recent finds, for the new-tab page. Goes through
// apiGet so it inherits the token refresh + 401-retry the raw newtab fetch
// lacked — an expired access token was throwing "API error: 401" on every tab.
export async function getFinds(limit = 40) {
  return apiGet(`/api/extension/finds?limit=${limit}`)
}

// Ask the backend for a "why you saved it" list-name suggestion for a gem.
// Returns { name } (or { name: null } if nothing sensible could be generated).
export async function suggestListName(bookmarkId) {
  return apiPost('/api/extension/suggest-list-name', { bookmark_id: bookmarkId })
}
