// Dev-only stand-in for the chrome.* APIs, so popup.html runs in a plain tab
// (see dev/preview.html). popup.js loads this only when chrome.runtime.id is
// missing, which never happens inside the real extension. Not shipped: leave
// extension/dev/ out of the store zip.
//
// ?s= picks the scenario:
//   fresh      new save, the tab capture lands (default)
//   og         scrolled page: no capture, the og image leads
//   ogwins     the capture lands, but the card leads with og: the plate swaps
//   noimage    nothing to show; the plate keeps the mark
//   saved      already in your Bulletin: the card opens on the picker
//   savedlate  same, but the check answers late (the plate flips to it)
//   resaved    old path: already saved, found out only by saving again
//   slow       the save takes 6s (bar holds at 92%)
//   error      the save fails
//   onboarding account without a Bulletin yet (no handle → Finish setup)
//   blocked    a chrome:// page
//   nolists    a new account with no lists
//   signedout  the sign-in view
//   hang       the save never answers (the states board's "Saving")

const S = new URLSearchParams(location.search).get('s') || 'fresh'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const tell = (m) => { try { parent.postMessage({ source: 'bulletin-popup', ...m }, '*') } catch {} }

// ?n= how many lists the account has (default 7).
const NAMES = [
  'Reading', 'Tools', 'Coffee spots', 'Design references', 'Gifts for Dad',
  'Things to make', 'Watch later', 'Kyoto trip', 'Studio ideas', 'Good typography',
  'Recipes to try', 'Running gear', 'Podcasts', 'Home office',
]
const N = Number(new URLSearchParams(location.search).get('n')) || 7
// Two of them private (migration 033), to show the lock.
const LISTS = S === 'nolists' ? [] : NAMES.slice(0, N).map((name, i) => ({
  id: `l${i + 1}`, name, slug: name.toLowerCase().replace(/\W+/g, '-'),
  is_private: name === 'Gifts for Dad' || name === 'Kyoto trip',
}))
let lists = [...LISTS]
const members = new Set(S === 'resaved' ? ['l1', 'l4'] : [])

function connect() {
  const listeners = []
  const post = (m) => listeners.forEach((fn) => fn(m))
  return {
    onMessage: { addListener: (fn) => listeners.push(fn) },
    onDisconnect: { addListener() {} },
    disconnect() {},
    async postMessage(msg) {
      if (msg?.type !== 'save') return
      const shotOn = ['fresh', 'resaved', 'slow', 'ogwins'].includes(S)
      if (shotOn) setTimeout(() => post({ type: 'shot', dataUrl: 'dev/sample-shot.jpg' }), 350)
      setTimeout(() => post({ type: 'meta', image: S === 'noimage' ? null : 'dev/sample-og.jpg', title: 'The quiet workshop' }), 500)
      if (S === 'error') {
        await wait(1500)
        return post({ type: 'error', message: 'request failed (500)' })
      }
      if (S === 'onboarding') {
        await wait(900)
        return post({ type: 'error', code: 'needs_onboarding', message: 'Almost there. Finish setting up your Bulletin at yourbulletin.com/start, then save again.' })
      }
      if (S === 'hang') return
      await wait(S === 'slow' ? 6000 : 1100)
      post({
        type: 'saved',
        bookmark: { id: 'b1', title: 'The quiet workshop', image_url: S === 'noimage' ? null : 'dev/sample-og.jpg' },
        refreshed: S === 'resaved',
        lead: ['og', 'ogwins'].includes(S) ? 'og' : 'screenshot',
        username: 'tim',
      })
    },
  }
}

async function sendMessage(msg) {
  await wait(msg?.type === 'ig-get-lists' ? 250 : msg?.type === 'ig-check-saved' ? 450 : 180)
  switch (msg?.type) {
    case 'ig-check-saved': {
      if (!['saved', 'savedlate'].includes(S)) return { bookmark: null }
      if (S === 'savedlate') await wait(900)
      return {
        bookmark: { id: 'b1', title: 'The quiet workshop', image_url: 'dev/sample-shot.jpg' },
        lists, memberOf: ['l1', 'l4'], username: 'tim',
      }
    }
    case 'ig-remove':
      tell({ type: 'log', text: 'Removed (held 5s for Undo, then deleted)' })
      return { ok: true }
    case 'ig-undo-remove':
      tell({ type: 'log', text: 'Undo: kept' })
      return { ok: true }
    case 'ig-get-lists':
      return { ok: true, lists, memberOf: msg.bookmarkId ? [...members] : [], username: S === 'onboarding' ? null : 'tim' }
    case 'ig-set-list':
      tell({ type: 'log', text: `${msg.add ? 'Added to' : 'Removed from'} ${lists.find((l) => l.id === msg.listId)?.name}` })
      return { ok: true }
    case 'ig-create-list': {
      const existing = lists.find((l) => l.name.toLowerCase() === msg.name.toLowerCase())
      const list = existing || { id: `n${Date.now()}`, name: msg.name, slug: msg.name.toLowerCase().replace(/\W+/g, '-') }
      if (!existing) lists = [list, ...lists]
      tell({ type: 'log', text: `Created list "${msg.name}"` })
      return { ok: true, list }
    }
    case 'ig-card-verify':
      return { ok: true }
    case 'ig-google-signin':
      tell({ type: 'log', text: 'Google sign-in would open' })
      return { ok: true }
  }
  return { ok: true }
}

const store = S === 'signedout' ? {} : { ig_session: { access_token: 'dev' } }
if (new URLSearchParams(location.search).get('handle') === 'known') store.ig_username = 'tim'

globalThis.chrome = {
  runtime: { sendMessage, connect },
  tabs: {
    query: async () => [{
      id: 1,
      windowId: 1,
      url: S === 'blocked' ? 'chrome://newtab/' : 'https://www.craftjournal.com/issues/12/the-quiet-workshop',
      title: 'The quiet workshop',
    }],
    create: ({ url }) => tell({ type: 'log', text: `Opens ${url}` }),
    get: async () => (await globalThis.chrome.tabs.query())[0],
  },
  storage: {
    local: {
      // In memory, like chrome.storage for one popup session. ?handle=known
      // pre-seeds the remembered handle (a returning user).
      get: async (k) => {
        const all = { ...store }
        return typeof k === 'string' ? (k in all ? { [k]: all[k] } : {}) : all
      },
      set: async (o) => { Object.assign(store, o) },
      remove: async (k) => { for (const x of [].concat(k)) delete store[x] },
    },
  },
  action: { setPopup: async () => {} },
  identity: { getRedirectURL: () => 'https://dev.chromiumapp.org/' },
}

window.close = () => tell({ type: 'closed' })

new ResizeObserver(() => tell({ type: 'size', h: document.body.scrollHeight, w: document.body.offsetWidth })).observe(document.body)
