// Service worker — the extension's brain.
//
// Saving is mymind-style: a single left-click on the toolbar icon saves the
// current page immediately and an on-page toast (content/toast.js) confirms it
// and lets you edit tags inline. No popup, no preview, no "save" button.
//
// To make the icon click fire here instead of opening a popup, we clear the
// action popup while signed in (chrome.action.setPopup({popup:''})). When
// signed out we restore popup.html so the click opens the Google sign-in. The
// popup's only job is auth; everything else happens on the page.

import {
  saveGem,
  getSession,
  signIn,
  signOut,
  getLists,
  createList,
  setListMembership,
  suggestListNames,
} from './auth.js'
import { CONFIG } from './config.js'

// Right-click menus on a page/image/selection, plus two items on the
// right-click menu of the toolbar icon itself (contexts: 'action').
const MENU = {
  PAGE: 'ig_save_page',
  IMAGE: 'ig_save_image',
  SELECTION: 'ig_save_selection',
  OPEN: 'ig_open_gems',
  SIGNOUT: 'ig_sign_out',
}

// ── Popup state ─────────────────────────────────────────────────────
// Signed in → no popup (click saves). Signed out → popup.html (click signs in).
async function syncPopup() {
  const session = await getSession()
  await chrome.action.setPopup({ popup: session ? '' : 'popup.html' })
}

chrome.runtime.onInstalled.addListener(() => {
  buildMenus()
  syncPopup()
})
chrome.runtime.onStartup.addListener(syncPopup)

function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU.PAGE,
      title: 'Save this page to Bulletin',
      contexts: ['page', 'link'],
    })
    chrome.contextMenus.create({
      id: MENU.IMAGE,
      title: 'Save this image to Bulletin',
      contexts: ['image'],
    })
    chrome.contextMenus.create({
      id: MENU.SELECTION,
      title: 'Save this quote to Bulletin',
      contexts: ['selection'],
    })
    // Items on the toolbar-icon right-click menu.
    chrome.contextMenus.create({
      id: MENU.OPEN,
      title: 'Open my finds',
      contexts: ['action'],
    })
    chrome.contextMenus.create({
      id: MENU.SIGNOUT,
      title: 'Sign out',
      contexts: ['action'],
    })
  })
}

// ── One-click save (toolbar icon) ───────────────────────────────────
// Only fires when the popup is cleared, i.e. while signed in.
chrome.action.onClicked.addListener((tab) => {
  saveActiveTab(tab)
})

async function saveActiveTab(tab) {
  const session = await getSession()
  if (!session) return promptSignIn()
  const clientMeta = await readPageMeta(tab?.id)
  // Always capture the visible tab — it's the user's own rendered view (their
  // session/IP), so it bypasses the datacenter-IP block that defeats our server
  // screenshot, and it's mymind-grade for landing pages. We send BOTH this and
  // the og image; the server's pickCardImage picks per card_type — landing/
  // profile pages show the screenshot, articles/products keep their og, so the
  // shot is stored-but-unused there. Viewport/hero only — preview-grade.
  const clientShot = await captureTab(tab?.windowId)
  await saveFlow(tab, { url: tab?.url, title: tab?.title, clientMeta, clientShot })
}

// Screenshot the visible area of the active tab. Needs activeTab (granted on the
// icon click) — no new permission. Returns a JPEG data URL, or null on
// chrome://, the Web Store, PDF viewers, or if the gesture didn't grant access.
async function captureTab(windowId) {
  try {
    const opts = { format: 'jpeg', quality: 80 }
    return windowId != null
      ? await chrome.tabs.captureVisibleTab(windowId, opts)
      : await chrome.tabs.captureVisibleTab(opts)
  } catch {
    return null
  }
}

// Read og/meta tags from the active tab's LIVE DOM — i.e. from the user's own
// browser, with their session, cookies and (residential) IP. Paywalled and
// bot-blocked sites (WSJ, Bloomberg, Gap, …) that 401/403 our server still
// render a real og:image + title here, because the user has access. This is the
// core of client-side capture. activeTab + scripting already grant it — no new
// permission. Returns null on chrome://, the Web Store, PDF viewers, etc., where
// we fall back to the server's extractMetadata.
async function readPageMeta(tabId) {
  if (tabId == null) return null
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const c = (sel, doc = document) => doc.querySelector(sel)?.getAttribute('content')?.trim() || null
        const m = (p, doc = document) => c(`meta[property="${p}"]`, doc) || c(`meta[name="${p}"]`, doc)
        const abs = (u) => { try { return u ? new URL(u, location.href).href : null } catch { return u } }
        // The image the publisher DECLARED in JSON-LD (Product/Article/…). High
        // confidence — we don't guess "the biggest <img>", we read what the site
        // marked as canonical, skipping Organization/WebSite logos. Catches clean
        // product/article shots on pages that have no og:image (e.g. Gap), and
        // when absent we fall through to the visible-tab screenshot.
        const jsonLdImage = (doc = document) => {
          for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
            let data
            try { data = JSON.parse(s.textContent) } catch { continue }
            const nodes = []
            const collect = (x) => {
              if (!x) return
              if (Array.isArray(x)) return x.forEach(collect)
              if (typeof x === 'object') { nodes.push(x); if (Array.isArray(x['@graph'])) x['@graph'].forEach(collect) }
            }
            collect(data)
            for (const n of nodes) {
              const t = Array.isArray(n['@type']) ? n['@type'].join() : (n['@type'] || '')
              if (/Organization|WebSite|BreadcrumbList|Person/i.test(t)) continue
              const img = n.image
              if (typeof img === 'string') return img
              if (Array.isArray(img) && img.length) {
                const f = img[0]
                if (typeof f === 'string') return f
                if (f && typeof f.url === 'string') return f.url
              }
              if (img && typeof img === 'object' && typeof img.url === 'string') return img.url
            }
          }
          return null
        }
        const extract = (doc = document) => ({
          title: m('og:title', doc) || m('twitter:title', doc) || null,
          image: abs(
            m('og:image', doc) || m('og:image:url', doc) || m('twitter:image', doc) ||
            jsonLdImage(doc) ||
            c('meta[itemprop="image"]', doc) ||
            doc.querySelector('link[rel="image_src"]')?.getAttribute('href') ||
            null,
          ),
          description: m('og:description', doc) || m('twitter:description', doc) || m('description', doc),
          siteName: m('og:site_name', doc),
          ogUrl: m('og:url', doc),
        })

        let meta = extract()

        // SPA staleness: after client-side navigation (Instagram, Twitter, …)
        // the <meta> tags still describe the PREVIOUS page — og:url disagrees
        // with the address bar. Refetch the current URL same-origin WITH the
        // user's cookies (that's the whole trick: the server returns fresh
        // HTML with correct og for the page they're actually on) and re-read.
        try {
          const samePath = (a, b) => {
            try { return new URL(a).pathname.replace(/\/+$/, '') === new URL(b).pathname.replace(/\/+$/, '') } catch { return true }
          }
          if (!meta.title || (meta.ogUrl && !samePath(meta.ogUrl, location.href))) {
            const r = await fetch(location.href, { credentials: 'include' })
            const doc2 = new DOMParser().parseFromString(await r.text(), 'text/html')
            const fresh = extract(doc2)
            if (fresh.title || fresh.image) {
              for (const k of ['title', 'image', 'description', 'siteName']) {
                if (fresh[k]) meta[k] = k === 'image' ? abs(fresh[k]) : fresh[k]
              }
            }
          }
        } catch {}

        // Per-site: Instagram profile pages. og:description is a follower-stats
        // dump and the bio never appears in metadata at all — but it's right
        // there in the rendered header. Grab bio + avatar from the DOM.
        // Profile pages only (/<handle>), never posts/reels/etc.
        const igProfile =
          /(^|\.)instagram\.com$/.test(location.hostname) &&
          /^\/[^/]+\/?$/.test(location.pathname) &&
          !/^\/(p|reel|reels|stories|explore|accounts|direct|tv)\//.test(location.pathname + '/')
        if (igProfile) {
          const avatar = document.querySelector('header img[alt*="profile picture" i]')?.src || null
          // The bio is the wordiest text block in the profile header; skip
          // counts ("198 posts"), buttons, and the "Followed by …" line.
          const junk = /^(\d|Follow\b|Message\b|Followed by)/
          const bio = [...document.querySelectorAll('header section span[dir="auto"]')]
            .map((s) => s.textContent.trim())
            .filter((t) => t.length > 8 && !junk.test(t))
            .sort((a, b) => b.length - a.length)[0] || null
          if (bio) meta.description = bio
          if (avatar) meta.image = avatar
        }

        // Per-site: X/Twitter status pages. og is login-walled junk, but the
        // tweet is right there in the rendered DOM. Match the <article> whose
        // timestamp link points at THIS status id — never a thread parent or a
        // reply. Captured text becomes the description (search + embeddings +
        // the future tweet card layout all ride on it).
        const xStatus =
          /(^|\.)(x|twitter)\.com$/.test(location.hostname) &&
          location.pathname.match(/^\/([^/]+)\/status\/(\d+)/)
        if (xStatus) {
          const statusId = xStatus[2]
          const articles = [...document.querySelectorAll('article')]
          const art =
            articles.find((a) => a.querySelector(`a[href*="/status/${statusId}"] time`)) ||
            articles[0]
          if (art) {
            const text = art.querySelector('[data-testid="tweetText"]')?.innerText?.trim() || null
            // User-Name block reads "Roy\n@im_roy_lee\n·\n1h" — name first,
            // handle is the @-prefixed line (URL segment as fallback).
            const lines = (art.querySelector('[data-testid="User-Name"]')?.innerText || '')
              .split('\n').map((s) => s.trim()).filter(Boolean)
            const name = lines[0] || null
            const handle = lines.find((l) => l.startsWith('@')) || `@${xStatus[1]}`
            const media = art.querySelector('[data-testid="tweetPhoto"] img')?.src || null
            if (text) meta.description = text
            if (name) meta.title = `${name} (${handle}) on X`
            if (media) meta.image = media
            meta.siteName = 'X'
          }
        }

        // Last-resort title: the tab title, minus any "(9+)" notification badge.
        if (!meta.title) meta.title = (document.title || '').replace(/^\(\d+\+?\)\s*/, '').trim() || null

        return { title: meta.title, image: meta.image, description: meta.description, siteName: meta.siteName }
      },
    })
    const r = res?.result
    return r && (r.title || r.image) ? r : null
  } catch {
    return null
  }
}

// ── Context menus ───────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU.OPEN) {
    chrome.tabs.create({ url: CONFIG.API_BASE })
    return
  }
  if (info.menuItemId === MENU.SIGNOUT) {
    await signOut()
    await syncPopup()
    notify('Signed out', 'Click the Bulletin icon to sign back in.')
    return
  }

  const session = await getSession()
  if (!session) return promptSignIn()

  // Page/selection saves are "this page" → attach client-read og. Image saves
  // keep their explicit srcUrl (the server lets imageOverride win), but still
  // benefit from the client title.
  const clientMeta = await readPageMeta(tab?.id)
  let payload
  if (info.menuItemId === MENU.IMAGE) {
    payload = { url: info.pageUrl || tab?.url, title: tab?.title, image_url: info.srcUrl, clientMeta }
  } else if (info.menuItemId === MENU.SELECTION) {
    payload = { url: info.pageUrl || tab?.url, title: tab?.title, note: info.selectionText, clientMeta }
  } else {
    payload = { url: info.linkUrl || info.pageUrl || tab?.url, title: tab?.title, clientMeta }
  }
  await saveFlow(tab, payload)
})

// ── The save flow shared by every entry point ───────────────────────
async function saveFlow(tab, payload) {
  const tabId = tab?.id
  // Show the toast immediately (it starts in a "Saving…" state) so the click
  // never feels dead while metadata + tagging run server-side.
  const injected = tabId != null ? await injectToast(tabId) : false

  try {
    const result = await saveGem(payload)
    const bm = result?.bookmark || {}
    if (injected) {
      toast(tabId, 'saved', { id: bm.id, title: bm.title })
    } else {
      notify('Saved', bm.title || 'Added to your collection.')
    }
  } catch (err) {
    const msg = String(err.message || err)
    const dup = msg.includes('already saved')
    // Session died mid-save: refresh() has already cleared the dead session.
    // Don't show the raw auth error ("Invalid Refresh Token…") — restore the
    // sign-in popup and prompt a friendly re-sign-in instead.
    if (err?.authExpired) {
      await syncPopup() // restore popup.html so the next icon click opens sign-in
      if (injected) {
        toast(tabId, 'signin', { title: payload.title })
      } else {
        notify('Session expired', 'Click the Bulletin icon to sign in again.')
      }
      // Best effort: the save was triggered by a recent icon-click gesture, so
      // this may pop sign-in open right away. Harmless if the gesture lapsed.
      try { await chrome.action.openPopup() } catch {}
      return
    }
    if (injected) {
      toast(tabId, dup ? 'duplicate' : 'error', { message: msg, title: payload.title })
    } else {
      notify(dup ? 'Already saved' : 'Couldn’t save', msg)
    }
  }
}

// ── Messages from popup (post-login) and toast (tag edits) ──────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Google sign-in runs HERE, not in the popup. launchWebAuthFlow opens an
  // external window, which steals focus and makes Chrome destroy the popup —
  // so any "signed in ✓" feedback wired into the popup never renders and the
  // post-login save never fires. The service worker survives that, so it owns
  // the flow: complete OAuth, confirm with a notification, then save the page
  // the user was on (captured before the auth window can change the active tab).
  if (msg?.type === 'ig-google-signin') {
    ;(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      try {
        await signIn()
        await syncPopup()
        notify('Signed in ✓', 'Saving this page to Bulletin…')
        if (tab) await saveActiveTab(tab)
        sendResponse({ ok: true })
      } catch (err) {
        notify('Sign-in failed', String(err?.message || err))
        sendResponse({ error: String(err?.message || err) })
      }
    })()
    return true // async response
  }
  if (msg?.type === 'ig-save-current-tab') {
    ;(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab) await saveActiveTab(tab)
      sendResponse({ ok: true })
    })()
    return true // keep the channel open for the async response
  }
  if (msg?.type === 'ig-get-lists') {
    getLists(msg.bookmarkId)
      .then((r) => sendResponse({ ok: true, lists: r.lists || [], memberOf: r.member_of || [] }))
      .catch((e) => sendResponse({ error: String(e.message || e) }))
    return true
  }
  if (msg?.type === 'ig-create-list') {
    createList(msg.name, msg.bookmarkId)
      .then((r) => sendResponse({ ok: true, list: r.list, url: r.url }))
      .catch((e) => sendResponse({ error: String(e.message || e) }))
    return true
  }
  if (msg?.type === 'ig-set-list') {
    setListMembership(msg.listId, msg.bookmarkId, msg.add)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ error: String(e.message || e) }))
    return true
  }
  if (msg?.type === 'ig-suggest-lists') {
    suggestListNames(msg.bookmarkId)
      .then((r) => sendResponse({ ok: true, names: (r && r.names) || [] }))
      .catch((e) => sendResponse({ error: String(e.message || e) }))
    return true
  }
})

// ── Toast injection + messaging ─────────────────────────────────────
// Returns true if the content script is in place. Injection is blocked on
// chrome:// pages, the Web Store, some PDF viewers — there we fall back to a
// native notification.
async function injectToast(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/toast.js'] })
    return true
  } catch {
    return false
  }
}
function toast(tabId, state, data) {
  chrome.tabs.sendMessage(tabId, { type: 'ig-toast', state, data }).catch(() => {})
}

// ── Signed-out handling from a click ────────────────────────────────
async function promptSignIn() {
  await syncPopup() // restore popup.html so the next click opens sign-in
  try {
    await chrome.action.openPopup() // best effort — needs a recent gesture
  } catch {
    notify('Sign in to save', 'Click the Bulletin icon to sign in with Google.')
  }
}

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message: message?.slice(0, 200) || '',
    })
  } catch {}
}
