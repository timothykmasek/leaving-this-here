// Service worker: right-click context menus for mymind-style saving directly
// from any page — the whole page, an image, or a highlighted quote — without
// opening the popup.

import { saveGem, getSession } from './auth.js'

const MENU = {
  PAGE: 'ig_save_page',
  IMAGE: 'ig_save_image',
  SELECTION: 'ig_save_selection',
}

chrome.runtime.onInstalled.addListener(() => {
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
  })
})

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const session = await getSession()
  if (!session) {
    notify('Sign in first', 'Click the internet gems icon to sign in.')
    return
  }

  try {
    let payload
    if (info.menuItemId === MENU.IMAGE) {
      payload = {
        url: info.pageUrl || tab?.url,
        title: tab?.title,
        image_url: info.srcUrl,
      }
    } else if (info.menuItemId === MENU.SELECTION) {
      payload = {
        url: info.pageUrl || tab?.url,
        title: tab?.title,
        note: info.selectionText,
      }
    } else {
      // link save uses the link's href; otherwise the page itself
      payload = {
        url: info.linkUrl || info.pageUrl || tab?.url,
        title: tab?.title,
      }
    }

    setBadge('…')
    const result = await saveGem(payload)
    setBadge('✓')
    notify('Saved 💎', result?.bookmark?.title || 'Added to your collection.')
  } catch (err) {
    setBadge('!')
    const msg = String(err.message || err)
    notify(
      msg.includes('already saved') ? 'Already saved' : 'Couldn’t save',
      msg
    )
  } finally {
    setTimeout(() => setBadge(''), 2500)
  }
})

function setBadge(text) {
  chrome.action.setBadgeText({ text })
  chrome.action.setBadgeBackgroundColor({ color: '#1a1a1a' })
}

function notify(title, message) {
  // Notifications are best-effort; ignore if the permission/icon is missing.
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message: message?.slice(0, 200) || '',
    })
  } catch {}
}
