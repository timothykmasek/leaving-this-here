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
  updateTags,
  getSession,
  signOut,
  getLists,
  createList,
  setListMembership,
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
      title: 'Save this page to internet gems 💎',
      contexts: ['page', 'link'],
    })
    chrome.contextMenus.create({
      id: MENU.IMAGE,
      title: 'Save this image to internet gems 💎',
      contexts: ['image'],
    })
    chrome.contextMenus.create({
      id: MENU.SELECTION,
      title: 'Save this quote to internet gems 💎',
      contexts: ['selection'],
    })
    // Items on the toolbar-icon right-click menu.
    chrome.contextMenus.create({
      id: MENU.OPEN,
      title: 'Open my gems',
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
  await saveFlow(tab, { url: tab?.url, title: tab?.title })
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
    notify('Signed out', 'Click the 💎 icon to sign back in.')
    return
  }

  const session = await getSession()
  if (!session) return promptSignIn()

  let payload
  if (info.menuItemId === MENU.IMAGE) {
    payload = { url: info.pageUrl || tab?.url, title: tab?.title, image_url: info.srcUrl }
  } else if (info.menuItemId === MENU.SELECTION) {
    payload = { url: info.pageUrl || tab?.url, title: tab?.title, note: info.selectionText }
  } else {
    payload = { url: info.linkUrl || info.pageUrl || tab?.url, title: tab?.title }
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
      toast(tabId, 'saved', { id: bm.id, title: bm.title, tags: bm.tags || [] })
    } else {
      notify('Saved 💎', bm.title || 'Added to your collection.')
    }
  } catch (err) {
    const msg = String(err.message || err)
    const dup = msg.includes('already saved')
    // Session died mid-save: refresh() has already cleared the dead session, so
    // restore the sign-in popup. The next icon click then opens sign-in instead
    // of silently failing against a token that can never be refreshed.
    if (err?.authExpired) await syncPopup()
    if (injected) {
      toast(tabId, dup ? 'duplicate' : 'error', { message: msg, title: payload.title })
    } else {
      notify(dup ? 'Already saved' : 'Couldn’t save', msg)
    }
  }
}

// ── Messages from popup (post-login) and toast (tag edits) ──────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'ig-save-current-tab') {
    ;(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab) await saveActiveTab(tab)
      sendResponse({ ok: true })
    })()
    return true // keep the channel open for the async response
  }
  if (msg?.type === 'ig-update-tags') {
    updateTags(msg.id, msg.tags)
      .then((r) => sendResponse({ ok: true, tags: r.tags }))
      .catch((e) => sendResponse({ error: String(e.message || e) }))
    return true
  }
  if (msg?.type === 'ig-get-lists') {
    getLists()
      .then((r) => sendResponse({ ok: true, lists: r.lists || [] }))
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
    notify('Sign in to save', 'Click the 💎 icon to sign in with Google.')
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
