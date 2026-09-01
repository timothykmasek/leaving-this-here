// Service worker — the extension's brain.
//
// Saving is mymind-style: a single left-click on the toolbar icon saves the
// current page immediately, and the on-page card (content/toast.js) is the
// whole experience — saving state, public/secret toggle, ranked list picker,
// Create List screen. No popup while signed in.
//
// To make the icon click fire here instead of opening a popup, we clear the
// action popup while signed in (chrome.action.setPopup({popup:''})). When
// signed out we restore popup.html so the click opens sign-in. The popup's
// only job is auth; everything else happens on the page.

import {
  saveGem,
  getSession,
  signIn,
  signOut,
  getLists,
  createList,
  setListMembership,
  setBulletVisibility,
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
// Signed in → no popup (click saves + shows the on-page card). Signed out →
// popup.html (click signs in).
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
  const payload = await buildPagePayload(tab)
  await saveFlow(tab, payload)
}

// Everything a "save this page" needs, gathered from the live tab.
async function buildPagePayload(tab) {
  const clientMeta = await readPageMeta(tab?.id)
  // Always capture the visible tab — it's the user's own rendered view (their
  // session/IP), so it bypasses the datacenter-IP block that defeats our server
  // screenshot, and it's mymind-grade for landing pages. We send BOTH this and
  // the og image; the server's pickCardImage picks per card_type — landing/
  // profile pages show the screenshot, articles/products keep their og, so the
  // shot is stored-but-unused there. Viewport/hero only — preview-grade.
  const clientShot = await captureTab(tab)
  return { url: tab?.url, title: tab?.title, clientMeta, clientShot }
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
    // Explicit image save — the src IS the picture; no page screenshot wanted.
    payload = { url: info.pageUrl || tab?.url, title: tab?.title, image_url: info.srcUrl, clientMeta }
  } else if (info.menuItemId === MENU.SELECTION) {
    // Selection is always on the current, visible page → hero shot is valid.
    payload = { url: info.pageUrl || tab?.url, title: tab?.title, note: info.selectionText, clientMeta, clientShot: await captureTab(tab) }
  } else {
    // MENU.PAGE fires on both a page and a right-clicked link. Only capture the
    // visible tab when we're saving THIS page — for a link save (info.linkUrl),
    // the target isn't what's on screen, so a shot would be the wrong page.
    const savingCurrentPage = !info.linkUrl
    payload = {
      url: info.linkUrl || info.pageUrl || tab?.url,
      title: tab?.title,
      clientMeta,
      ...(savingCurrentPage ? { clientShot: await captureTab(tab) } : {}),
    }
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
    const refreshed = !!result?.refreshed
    if (injected) {
      // `refreshed` = re-save updated the existing card in place.
      toast(tabId, 'saved', { id: bm.id, title: bm.title, refreshed })
    } else {
      notify(refreshed ? 'Updated' : 'Saved', bm.title || 'Added to your collection.')
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
    createList(msg.name, msg.bookmarkId, msg.isPrivate)
      .then((r) => sendResponse({ ok: true, list: r.list, url: r.url }))
      .catch((e) => sendResponse({ error: String(e.message || e) }))
    return true
  }
  if (msg?.type === 'ig-set-visibility') {
    setBulletVisibility(msg.bookmarkId, msg.isPrivate)
      .then(() => sendResponse({ ok: true }))
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
