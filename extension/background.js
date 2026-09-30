// Service worker — the extension's brain.
//
// Saving happens in a CARD floated onto the page (2026-09-28 redesign). The
// icon click injects it (mountCard below): an iframe of popup.html?card=1,
// in a closed shadow root, top-right under the toolbar, with real rounded
// corners and shadow (a toolbar popup can't have either). You confirm the
// save on the plate, watch the page's hero resolve on it, file it to lists,
// and the card goes away. No silent one-click save, no right-click save.
//
// Where a page can't take a card (chrome://, the Web Store, PDF viewers) the
// same popup.html opens as the ordinary toolbar popup instead. Signed out,
// the icon opens the popup too (sign-in).
//
// The card and the popup are short-lived, so the work that must finish runs
// HERE: the tab capture, the live-DOM meta read, the save request and the
// out-of-band screenshot upload. The page drives it over a port ('ig-save')
// and just renders what comes back. If it closes mid-save, the save lands.
//
// There is no visibility control: a bullet is on the page when it's in a
// list (migration 028), and never otherwise.

import {
  getSession,
  saveGem,
  sendClientShot,
  sendNoShot,
  signIn,
  signOut,
  getLists,
  createList,
  setListMembership,
  deleteBullet,
} from './auth.js'
import { CONFIG } from './config.js'

// Only the toolbar icon's own right-click menu survives: open your page, sign
// out. Page/image/selection saves were retired with the popup-only flow.
const MENU = {
  OPEN: 'ig_open_gems',
  SIGNOUT: 'ig_sign_out',
}

// Signed in → no toolbar popup, so the click reaches onClicked and floats
// the card. Signed out → popup.html (sign-in). Kept in step with the session
// by watching storage, so every sign-in/out path is covered.
async function syncPopup() {
  const session = await getSession()
  await chrome.action.setPopup({ popup: session ? '' : 'popup.html' })
}

chrome.runtime.onInstalled.addListener(() => {
  buildMenus()
  syncPopup()
  // The stale sticky-secret counter from builds ≤0.5.2.
  chrome.storage.local.remove('ig_private_streak').catch?.(() => {})
})
chrome.runtime.onStartup.addListener(syncPopup)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'ig_session' in changes) syncPopup()
})

function buildMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU.OPEN,
      title: 'Open your Bulletin',
      contexts: ['action'],
    })
    chrome.contextMenus.create({
      id: MENU.SIGNOUT,
      title: 'Sign out',
      contexts: ['action'],
    })
  })
}

// Known cookie-consent / newsletter-popup containers, by their STABLE vendor
// identifiers (OneTrust doesn't rename #onetrust-banner-sdk across its customers)
// — so ~40 selectors cover the concentrated head of the CMP + email-capture
// market. This is the precise half of the stripper: near-zero false positives,
// low maintenance. The fuzzy half (the backdrop heuristic in stripOverlaysInPage)
// handles the custom modals these don't name. Reference for upkeep: Consent-O-Matic
// (github, structured CMP rules) + AdGuard Annoyances lists — hand-picked, not
// copied, so nothing carries their filter-list license.
const POPUP_SELECTORS = [
  // ── Consent management platforms ──
  '#onetrust-consent-sdk', '#onetrust-banner-sdk',              // OneTrust
  '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay', // Cookiebot
  '#usercentrics-root', '[data-testid="uc-container"]',         // Usercentrics (shadow host)
  '#didomi-host', '.didomi-popup-open',                         // Didomi
  '.qc-cmp2-container', '.qc-cmp-cleanslate',                   // Quantcast
  '#truste-consent-track', '.truste_overlay', '.truste_box_overlay', // TrustArc
  '.osano-cm-window', '.osano-cm-dialog',                       // Osano
  '#cookie-law-info-bar',                                       // CookieYes / GDPR Cookie Consent
  '.cc-window', '.cc-banner',                                   // cookieconsent (Insites/Osano)
  '#hs-eu-cookie-confirmation',                                 // HubSpot
  '#gdpr-cookie-message',
  '#termly-code-snippet-support', '[id^="sp_message_container"]', '.sp_veil', // Termly, Sourcepoint
  '#shopify-pc__banner',                                        // Shopify consent
  '.termsfeed-com---nb', '.termsfeed-com---palette-dark',       // TermsFeed
  // ── Newsletter / discount capture ──
  '[class^="klaviyo-form-"]', '.kl-private-reset-css-Xuajs1',   // Klaviyo
  '#privy-container', '[id^="privy-"]',                         // Privy
  '.om-holder', '.omapp-campaign',                             // OptinMonster
  '[id^="sumome-"]', '[id^="sumo-"]',                           // Sumo
  '#juEmbed', '.junoOverlay', '[id^="justuno"]',               // Justuno
  '.mc-modal',                                                 // Mailchimp popup
  '.wisepops-popup', '[id^="wisepops"]',                       // Wisepops
  '[class*="sleeknote"]',                                       // Sleeknote
  '#attentive_creative', '[id^="attentive"]',                  // Attentive
]
// Backdrop must cover at least this fraction of the viewport to count. Kept HIGH
// on purpose: a real dimming layer is ~full-screen, so a high bar is exactly what
// gives the heuristic its precision. Lowering it toward ~0.2 starts matching
// fixed heroes, sticky navs, sidebars — legit chrome we must NOT strip.
const MIN_BACKDROP_COVERAGE = 0.5
// When a backdrop (or scroll-lock) is present, also strip the modal panel riding
// above it — any fixed/absolute element at/above this z-index. Guarded by the
// backdrop so lone chat bubbles / sticky bars (which have no backdrop) survive.
const MODAL_Z_FLOOR = 100

// Injected into the page (isolated world — shares the DOM, not the page's JS) to
// hide cookie/newsletter overlays just before the capture, then reversed by
// unstripPage afterwards. Also scrolls to the hero. Returns {restoreY, changed,
// polluted}: `polluted` means a dimming overlay SURVIVED our pass (closed shadow
// DOM / cross-origin iframe we can't reach) — the shot is still dirty and the
// caller drops it so the og:image leads instead. Self-contained (executeScript
// serializes it) — everything it needs comes through `opts`.
function stripOverlaysInPage(opts) {
  const { selectors, minCoverage, zFloor } = opts
  const STYLE_ID = '__bulletin_strip_style'
  const MARK = 'data-bulletin-stripped'
  const vw = window.innerWidth, vh = window.innerHeight
  const vArea = Math.max(1, vw * vh)

  const restoreY = window.scrollY || document.documentElement.scrollTop || 0
  if (restoreY > 100) window.scrollTo(0, 0)

  // A background with alpha in (0.03, 0.97) is a dim VEIL — not an opaque hero
  // (alpha ~1, excluded) and not a transparent click-catcher (alpha ~0, which
  // doesn't pollute the image anyway, so we don't care about it).
  const isVeil = (bg) => {
    const m = /rgba?\(([^)]+)\)/.exec(bg || '')
    if (!m) return false
    const p = m[1].split(',').map((s) => s.trim())
    if (p.length < 4) return false
    const a = parseFloat(p[3])
    return a > 0.03 && a < 0.97
  }
  const coverage = (el) => {
    const r = el.getBoundingClientRect()
    const w = Math.min(r.right, vw) - Math.max(r.left, 0)
    const h = Math.min(r.bottom, vh) - Math.max(r.top, 0)
    return w <= 0 || h <= 0 ? 0 : (w * h) / vArea
  }
  const zOf = (cs) => { const z = parseInt(cs.zIndex, 10); return Number.isFinite(z) ? z : 0 }
  const visible = (cs) => cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) !== 0
  const positioned = (cs) => cs.position === 'fixed' || cs.position === 'absolute'

  const all = Array.from(document.querySelectorAll('body *'))
  const mark = (el) => el.setAttribute(MARK, '1')

  // 1) Dimming backdrops: fixed/absolute + near-full-screen + semi-transparent.
  let backdropZ = null
  for (const el of all) {
    if (el.hasAttribute(MARK)) continue
    const cs = getComputedStyle(el)
    if (!visible(cs) || !positioned(cs)) continue
    if (coverage(el) < minCoverage || !isVeil(cs.backgroundColor)) continue
    mark(el) // display:none also hides a modal nested inside the backdrop
    backdropZ = backdropZ == null ? zOf(cs) : Math.max(backdropZ, zOf(cs))
  }

  // 2) Modal panels riding on a backdrop / scroll-lock (a sibling, not nested).
  const locked =
    getComputedStyle(document.documentElement).overflow === 'hidden' ||
    getComputedStyle(document.body).overflow === 'hidden'
  if (backdropZ != null || locked) {
    // At least 1, so a backdrop with z-index:auto (→0) can't drag the floor to 0
    // and sweep in every positioned element on the page.
    const floor = Math.max(1, backdropZ != null ? backdropZ : zFloor)
    for (const el of all) {
      if (el.hasAttribute(MARK)) continue
      const cs = getComputedStyle(el)
      if (!visible(cs) || !positioned(cs) || zOf(cs) < floor) continue
      const cov = coverage(el)
      if (cov < 0.02 || cov > 0.95) continue // skip micro-decor and full-page wrappers
      mark(el)
    }
  }

  // 3) One <style> node hides the vendor list + everything we marked + releases
  //    the scroll lock. Each vendor selector is its own rule so a single bad one
  //    can't drop the whole sheet. Removing this node fully reverts the page.
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent =
    selectors.map((s) => `${s}{display:none !important}`).join('\n') +
    `\n[${MARK}]{display:none !important}\nhtml,body{overflow:auto !important}`
  document.head.appendChild(style)

  // Did we actually change anything? (Skip the settle-wait if the page was clean.)
  let selectorHit = false
  for (const s of selectors) { try { if (document.querySelector(s)) { selectorHit = true; break } } catch {} }
  const changed = backdropZ != null || locked || selectorHit || restoreY > 100

  // 4) Residual check — a veil we neither marked nor selector-hid is still up
  //    (closed shadow DOM / cross-origin overlay iframe). The shot stays dirty.
  let polluted = false
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    if (el.hasAttribute(MARK)) continue
    const cs = getComputedStyle(el)
    if (!visible(cs) || !positioned(cs)) continue
    if (coverage(el) >= minCoverage && isVeil(cs.backgroundColor)) { polluted = true; break }
  }
  if (!polluted) {
    for (const f of Array.from(document.querySelectorAll('iframe'))) {
      const cs = getComputedStyle(f)
      if (visible(cs) && positioned(cs) && coverage(f) >= minCoverage && zOf(cs) >= zFloor) {
        polluted = true; break
      }
    }
  }

  return { restoreY, changed, polluted }
}

// Reverse stripOverlaysInPage: drop the injected stylesheet + our markers and
// restore the user's scroll. The save must never leave the page altered.
function unstripPage(restoreY) {
  const s = document.getElementById('__bulletin_strip_style')
  if (s) s.remove()
  for (const el of document.querySelectorAll('[data-bulletin-stripped]')) {
    el.removeAttribute('data-bulletin-stripped')
  }
  if (restoreY != null) window.scrollTo(0, restoreY)
}

// Screenshot the HERO of the active tab. captureVisibleTab only grabs what's on
// screen, so we first jump to the top (old bad-crop cause) AND strip the cookie /
// newsletter overlays that otherwise dominate a cold-visit capture — then shoot,
// then reverse both so the user's page is untouched. Uses activeTab + scripting
// (both already granted) — no new permission. Returns a JPEG data URL, or null on
// chrome:// / Web Store / PDF viewers, or when a dimming overlay survived the
// strip (a popup-covered shot is worse than none — null makes the card fall back
// to the og:image via cardImageCandidates).
async function captureTab(tab) {
  const tabId = tab?.id
  let restoreY = 0
  let changed = false
  let polluted = false

  // Mid-page saves skip the capture entirely. The old behavior jumped to the
  // top, stripped overlays, shot, and jumped back — which reads as the page
  // reloading (Tim: "it refreshes my browser"). A save must never move the
  // user's page, so scrolled-deep saves lean on og:image / the server
  // screenshot instead, and the strip below can never trigger a visible jump.
  if (tabId != null) {
    try {
      const [{ result: scrollY } = {}] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.scrollY || document.documentElement.scrollTop || 0,
      })
      if ((scrollY || 0) > 100) return null
    } catch {
      /* fall through — the strip/capture below has its own guards */
    }
  }

  if (tabId != null) {
    try {
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId },
        func: stripOverlaysInPage,
        args: [{ selectors: POPUP_SELECTORS, minCoverage: MIN_BACKDROP_COVERAGE, zFloor: MODAL_Z_FLOOR }],
      })
      if (result) {
        restoreY = result.restoreY || 0
        changed = !!result.changed
        polluted = !!result.polluted
      }
      // Let the removed overlays + scroll jump repaint before the shot — only
      // when we actually moved something (a clean page adds no latency).
      if (changed) await new Promise((r) => setTimeout(r, 320))
    } catch {
      /* scripting blocked (chrome://, Web Store, PDF viewer) — plain capture below */
    }
  }

  let shot = null
  try {
    const opts = { format: 'jpeg', quality: 80 }
    shot =
      tab?.windowId != null
        ? await chrome.tabs.captureVisibleTab(tab.windowId, opts)
        : await chrome.tabs.captureVisibleTab(opts)
  } catch {
    shot = null
  }

  // Undo the strip + scroll so the save never alters the user's live page.
  if (tabId != null && (changed || restoreY)) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: unstripPage, args: [restoreY] })
    } catch {
      /* best-effort */
    }
  }

  // A shot we couldn't de-clutter is dropped: no screenshot stored → the og:image
  // leads instead of a popup-covered capture. See cardImageCandidates.
  return polluted ? null : shot
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
            // Hard 800ms budget: this refetch fires on every SPA-stale page
            // (Instagram, X, …) and used to hold the whole save hostage to a
            // slow origin. Blowing the budget just means the tab title leads.
            const ctrl = new AbortController()
            const bomb = setTimeout(() => ctrl.abort(), 800)
            const r = await fetch(location.href, { credentials: 'include', signal: ctrl.signal })
            const doc2 = new DOMParser().parseFromString(await r.text(), 'text/html')
            clearTimeout(bomb)
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

        // Per-site: LinkedIn single-post pages (/posts/…-activity-… or
        // /feed/update/urn:…). Server og is auth-walled; the post is in the
        // rendered DOM. LinkedIn reshuffles classes often, so each field tries
        // a list of known selector generations and silently degrades to og.
        const liPost =
          /(^|\.)linkedin\.com$/.test(location.hostname) &&
          (/\/posts\//.test(location.pathname) || /\/feed\/update\//.test(location.pathname))
        if (liPost) {
          const firstText = (root, sels) => {
            for (const sel of sels) {
              const t = root.querySelector(sel)?.innerText?.trim()
              if (t) return t
            }
            return null
          }
          const scope = document.querySelector('.feed-shared-update-v2, [data-urn*="activity"], main') || document
          const text = firstText(scope, [
            '.update-components-text',
            '.feed-shared-inline-show-more-text',
            '.attributed-text-segment-list__content',
          ])
          const author = (firstText(scope, [
            '.update-components-actor__title',
            '[data-tracking-control-name*="actor"]',
          ]) || '').split('\n')[0].trim() || null
          const img = scope.querySelector('.update-components-image img, .ivm-view-attr__img--centered')?.src || null
          if (text) meta.description = text
          if (author) meta.title = `${author} on LinkedIn`
          if (img && !/data:image\/gif/.test(img)) meta.image = img
          if (text || author) meta.siteName = 'LinkedIn'
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

// ── The card ────────────────────────────────────────────────────────
// Each card gets a one-time key, tied to its tab. popup.html is web-
// accessible (it has to be, to sit in a page), so any site could frame it;
// without the key a framed copy renders nothing.
const cardKeys = new Map() // tabId → key
// The screenshot is taken at the click, BEFORE the card appears, so the card
// can never land in its own screenshot. The save picks it up from here.
const clickShots = new Map() // tabId → { at, shot: Promise<dataUrl|null> }
// "Is this page already saved?", asked at the click alongside the screenshot,
// so the card usually has its answer the moment it asks.
const clickChecks = new Map() // tabId → { at, url, answer: Promise }
const checkSaved = (url) =>
  getLists(null, url).then(
    (r) => ({
      ok: true,
      bookmark: r.saved ? { id: r.saved.id, title: r.saved.title, image_url: r.saved.image } : null,
      lists: r.lists || [],
      memberOf: r.member_of || [],
      username: r.username || null,
    }),
    (e) => ({ error: String(e?.message || e), authExpired: !!e?.authExpired }),
  )
const CARD_ORIGIN = chrome.runtime.getURL('').replace(/\/$/, '')

chrome.action.onClicked.addListener(async (tab) => {
  if (!(await getSession())) return openPopupHere(tab)
  if (!/^https?:/i.test(tab?.url || '')) return openPopupHere(tab)
  let open
  try {
    ;[{ result: open } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!document.getElementById('bulletin-card-host'),
    })
  } catch {
    return openPopupHere(tab) // the page won't take a script (PDF viewer, …)
  }
  // A second click on the icon closes the card.
  if (open) return injectCard(tab.id, null)
  clickChecks.set(tab.id, { at: Date.now(), url: tab.url, answer: checkSaved(tab.url) })
  const shot = captureTab(tab).catch(() => null)
  clickShots.set(tab.id, { at: Date.now(), shot })
  await shot
  const key = crypto.randomUUID()
  cardKeys.set(tab.id, key)
  injectCard(tab.id, chrome.runtime.getURL(`popup.html?card=1&tab=${tab.id}&k=${key}`))
})

function injectCard(tabId, src) {
  chrome.scripting
    .executeScript({ target: { tabId }, func: mountCard, args: [src, CARD_ORIGIN] })
    .catch(() => {})
}

// The ordinary toolbar popup, for this tab only (reset when it navigates).
async function openPopupHere(tab) {
  try {
    await chrome.action.setPopup({ tabId: tab.id, popup: 'popup.html' })
    await chrome.action.openPopup()
  } catch {
    notify('Bulletin', 'Click the Bulletin icon again to open it here.')
  }
}
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url) chrome.action.setPopup({ tabId, popup: '' }).catch(() => {})
})
chrome.tabs.onRemoved.addListener((tabId) => {
  cardKeys.delete(tabId)
  clickShots.delete(tabId)
  clickChecks.delete(tabId)
})

// Runs IN the page (self-contained: no closures). src = the card's page, or
// null to close an open card. Toggles: a second call closes.
function mountCard(src, origin) {
  const ID = 'bulletin-card-host'
  const old = document.getElementById(ID)
  if (old) {
    old.__bulletinClose?.()
    return
  }
  if (!src) return
  const host = document.createElement('div')
  host.id = ID
  host.style.cssText = 'all:initial;position:fixed;top:10px;right:14px;z-index:2147483647;'
  const root = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = `
    iframe {
      display: block; width: 360px; height: 248px; border: 0; border-radius: 16px;
      background: #fff; color-scheme: light;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.06), 0 16px 44px -12px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.08);
      opacity: 0; transform: translateY(-6px) scale(0.985); transform-origin: top right;
      transition: opacity 220ms ease, transform 320ms cubic-bezier(0.22,1,0.36,1),
        height 520ms cubic-bezier(0.22,1,0.36,1);
    }
    iframe.in { opacity: 1; transform: none; }
    iframe.out { opacity: 0; transform: translateY(-6px); transition: opacity 200ms ease, transform 200ms ease; }
  `
  const frame = document.createElement('iframe')
  frame.src = src
  frame.title = 'Bulletin'
  root.append(style, frame)
  document.documentElement.append(host)
  requestAnimationFrame(() => requestAnimationFrame(() => frame.classList.add('in')))

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    removeEventListener('message', onMessage)
    document.removeEventListener('mousedown', onDown, true)
    document.removeEventListener('keydown', onKey, true)
    frame.classList.remove('in')
    frame.classList.add('out')
    setTimeout(() => host.remove(), 220)
  }
  const onMessage = (e) => {
    if (e.origin !== origin || e.source !== frame.contentWindow) return
    const m = e.data
    if (!m || m.source !== 'bulletin-card') return
    if (m.type === 'size' && m.h > 0) frame.style.height = `${m.h}px`
    if (m.type === 'close') close()
  }
  // Clicks inside the card land in its frame, never here: any mousedown the
  // page sees is outside it.
  const onDown = () => close()
  const onKey = (e) => { if (e.key === 'Escape') close() }
  addEventListener('message', onMessage)
  document.addEventListener('mousedown', onDown, true)
  document.addEventListener('keydown', onKey, true)
  host.__bulletinClose = close
}

// Hide the card for a capture when there's no click-time shot to use (the
// worker restarted between the click and the save).
async function captureUnderCard(tab) {
  const setVis = (v) =>
    chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        func: (vis) => { const h = document.getElementById('bulletin-card-host'); if (h) h.style.visibility = vis },
        args: [v],
      })
      .catch(() => {})
  await setVis('hidden')
  await new Promise((r) => setTimeout(r, 60))
  try {
    return await captureTab(tab)
  } finally {
    await setVis('visible')
  }
}

// ── Toolbar-icon menu ───────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === MENU.OPEN) {
    chrome.tabs.create({ url: CONFIG.API_BASE })
    return
  }
  if (info.menuItemId === MENU.SIGNOUT) {
    await signOut()
    notify('Signed out', 'Click the Bulletin icon to sign back in.')
  }
})

// ── The save, driven by the popup over a port ───────────────────────
// Popup → { type: 'save', tab: { id, windowId, url, title } }
// Worker → { type: 'shot', dataUrl }      the tab capture, for the reveal
//          { type: 'meta', image, title } the live-DOM og read
//          { type: 'saved', bookmark, refreshed, lead, username }
//            lead: 'og' | 'screenshot', the image the card will lead with
//          { type: 'error', message, code, authExpired, alreadySaved }
// Every post is best-effort: the popup may already be gone, and the save
// carries on without it.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ig-save') return
  let alive = true
  port.onDisconnect.addListener(() => { alive = false })
  const post = (m) => { if (alive) try { port.postMessage(m) } catch { alive = false } }
  port.onMessage.addListener((msg) => {
    if (msg?.type === 'save' && msg.tab) saveTab(msg.tab, post, !!msg.card)
  })
})

async function saveTab(tab, post, card) {
  // The screenshot rides OUT-OF-BAND: capture starts now, in parallel with the
  // save, and uploads separately once the bookmark id exists — the save request
  // stays skinny and never waits on the camera. Capturing the user's own tab
  // still matters: their session/IP bypasses the datacenter block that defeats
  // the server screenshot on paywalled/bot-blocked sites. The popup also gets
  // the shot, so the plate can show the hero landing.
  // In the card, the shot was taken at the click (before the card showed).
  const early = clickShots.get(tab.id)
  clickShots.delete(tab.id)
  const shotPromise =
    early && Date.now() - early.at < 10 * 60 * 1000
      ? early.shot
      : card
        ? captureUnderCard(tab)
        : captureTab(tab)
  shotPromise.then((dataUrl) => { if (dataUrl) post({ type: 'shot', dataUrl }) }, () => {})

  const clientMeta = await readPageMeta(tab.id)
  if (clientMeta) post({ type: 'meta', image: clientMeta.image || null, title: clientMeta.title || null })

  try {
    // shotPending tells the server our own tab capture is on its way, so it
    // doesn't also buy a ScreenshotOne shot.
    const result = await saveGem({
      url: tab.url,
      title: tab.title,
      clientMeta,
      source: 'extension',
      shotPending: true,
    })
    const bm = result?.bookmark || {}
    post({
      type: 'saved',
      bookmark: { id: bm.id, title: bm.title, image_url: bm.image_url || null },
      refreshed: !!result?.refreshed,
      lead: result?.lead || null,
      username: result?.username || null,
    })
    if (bm.id) {
      shotPromise
        .catch(() => null)
        .then((shot) => (shot ? sendClientShot(bm.id, shot) : sendNoShot(bm.id)))
        .catch(() => {})
    }
  } catch (err) {
    const message = String(err?.message || err)
    console.error('[bulletin] save failed:', tab.url, err)
    post({
      type: 'error',
      message,
      code: err?.code || (/finish setting up/i.test(message) ? 'needs_onboarding' : null),
      authExpired: !!err?.authExpired,
      alreadySaved: message.includes('already saved'),
    })
  }
}

// ── Messages from the popup ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Google / Apple sign-in (msg.provider) runs HERE, not in the popup. launchWebAuthFlow opens an
  // external window, which steals focus and makes Chrome destroy the popup.
  // The service worker survives that, so it owns the flow. It no longer saves
  // the page afterwards: saving is always the user's click in the popup.
  if (msg?.type === 'ig-google-signin') {
    ;(async () => {
      try {
        await signIn(msg.provider || 'google')
        notify('Signed in', 'Click the Bulletin icon to save this page.')
        sendResponse({ ok: true })
      } catch (err) {
        notify('Sign-in failed', String(err?.message || err))
        sendResponse({ error: String(err?.message || err) })
      }
    })()
    return true // async response
  }
  // The card asks whether it was really put there by us (its tab + key).
  if (msg?.type === 'ig-card-verify') {
    const ok = !!msg.key && cardKeys.get(msg.tab) === msg.key && _sender?.tab?.id === msg.tab
    sendResponse({ ok })
    return
  }
  if (msg?.type === 'ig-get-lists') {
    getLists(msg.bookmarkId)
      .then((r) =>
        sendResponse({
          ok: true,
          lists: r.lists || [],
          memberOf: r.member_of || [],
          username: r.username || null,
          origin: CONFIG.API_BASE,
        })
      )
      .catch((e) => sendResponse({ error: String(e.message || e), authExpired: !!e?.authExpired }))
    return true
  }
  // The card asks whether its page is already saved. The click's answer if
  // it's for this page and fresh; otherwise ask now. A bullet whose Remove is
  // still in its Undo window is deleted first, so the answer is the truth
  // (and a save that follows can't be undone by the late delete).
  if (msg?.type === 'ig-check-saved') {
    ;(async () => {
      const early = clickChecks.get(msg.tabId)
      clickChecks.delete(msg.tabId)
      if (removals.size) await Promise.all([...removals.keys()].map(commitRemoval))
      const fresh = early && early.url === msg.url && Date.now() - early.at < 60 * 1000 && !removedSince(early.at)
      sendResponse(await (fresh ? early.answer : checkSaved(msg.url)))
    })()
    return true
  }
  // Remove is held for its Undo window, then deleted here (the card may be
  // gone by then). Undo just cancels it.
  if (msg?.type === 'ig-remove' && msg.bookmarkId) {
    const id = msg.bookmarkId
    clearTimeout(removals.get(id)?.timer)
    removals.set(id, { timer: setTimeout(() => commitRemoval(id), REMOVE_GRACE) })
    sendResponse({ ok: true })
    return
  }
  if (msg?.type === 'ig-undo-remove' && msg.bookmarkId) {
    clearTimeout(removals.get(msg.bookmarkId)?.timer)
    removals.delete(msg.bookmarkId)
    sendResponse({ ok: true })
    return
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
})

// ── Remove ──────────────────────────────────────────────────────────
// The card shows Undo for 5s; the delete waits a beat longer than that.
const REMOVE_GRACE = 6000
const removals = new Map() // bookmarkId → { timer }
let lastRemovalAt = 0
const removedSince = (t) => lastRemovalAt >= t
async function commitRemoval(id) {
  const r = removals.get(id)
  if (!r) return
  clearTimeout(r.timer)
  removals.delete(id)
  lastRemovalAt = Date.now()
  try {
    await deleteBullet(id)
  } catch (err) {
    if (!/not found/i.test(String(err?.message))) notify('Couldn’t remove', 'It’s still in your Bulletin. Try again.')
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
