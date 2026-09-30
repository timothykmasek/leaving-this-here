// Popup — sign-in, and (2026-09-28) the whole save.
//
// The toolbar icon always opens this. Signed in, it's one stage and one plate:
//   confirm   → the plate says "Save this page"; clicking it (or Enter) saves
//   saving    → a designed beat (SAVE_BEAT): the plate's dots merge into the
//               page's screenshot while the request runs in the service worker
//   (already saved: the card skips the plate and opens here, lists ticked,
//    with Delete / Undo in the header and no countdown)
//   lists     → the plate shrinks into the header tile; pick lists, then
//               Done/Skip (or leave it 8s) and the popup just goes away.
//               The header ("Saved to your Bulletin / In Reading") is the
//               confirmation; there's no final screen.
// The save itself runs in background.js (port 'ig-save') so it survives the
// popup being closed mid-flight.
//
// Served outside the extension (the dev preview, extension/dev/preview.html)
// there is no chrome.runtime.id, so a mock of the chrome APIs loads first.
if (!globalThis.chrome?.runtime?.id) await import(`./dev/mock-chrome.js?${Date.now()}`)
const { getSession, requestEmailCode, verifyEmailCode } = await import('./auth.js')
const { CONFIG } = await import('./config.js')

// ── Card mode ───────────────────────────────────────────────────────
// ?card=1: this page is the card the worker floated onto a web page (see
// background.js mountCard), not the toolbar popup. It talks to the page's
// host script by postMessage: its height (the card animates to it) and
// "close" (window.close() can't close a frame). It only renders if the
// worker vouches for its tab + key, so a site framing popup.html gets nothing.
const params = new URLSearchParams(location.search)
const CARD = params.get('card') === '1'
const CARD_TAB = Number(params.get('tab')) || null
if (CARD) {
  document.documentElement.classList.add('card')
  const post = (m) => parent.postMessage({ source: 'bulletin-card', ...m }, '*')
  window.close = () => post({ type: 'close' })
  new ResizeObserver(() => post({ type: 'size', h: document.body.scrollHeight })).observe(document.body)
  // Esc inside the card (the page's own Esc handler can't see into it).
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.close() })
}

// ── Timings ─────────────────────────────────────────────────────────
// SAVE_BEAT is a designed length, not the request's: the save usually returns
// well inside it, and the bar never finishes before the save does. ?beat=
// overrides it for tuning in the dev preview.
const SAVE_BEAT = Number(new URLSearchParams(location.search).get('beat')) || 2200
// ?hold= overrides it (the dev states board holds the picker open).
const HOLD = Number(new URLSearchParams(location.search).get('hold')) || 8000 // list picker, at full pace, before it closes itself
// "Already saved?": the plate says "Loading…" until it's answered (usually
// at once: it's asked at the click, alongside the screenshot the card already
// waits on). Past this, the plate offers the save anyway; a later answer
// still flips it to the picker, as long as they haven't clicked Save.
const CHECK_WAIT = 3000
// After Delete: the Undo window before the card closes itself.
const REMOVE_HOLD = 5000

// The list picker either EXPANDS to show every list (no scrolling, up to
// Chrome's 600px popup cap) or holds 3½ rows and scrolls. Expand is the
// default being tried; ?lists=scroll brings back the fixed height (dev preview).
const LISTS_EXPAND = new URLSearchParams(location.search).get('lists') !== 'scroll'
const POPUP_MAX = 600 // Chrome's hard cap on a popup's height
const ROW = 52

const $ = (id) => document.getElementById(id)

const views = {
  loading: $('view-loading'),
  signin: $('view-signin'),
  save: $('view-save'),
}

function show(name) {
  for (const [k, el] of Object.entries(views)) el.classList.toggle('hidden', k !== name)
}

function setHint(el, msg, kind) {
  el.textContent = msg
  el.classList.remove('hidden', 'ok', 'err')
  if (kind) el.classList.add(kind)
}

// ── Sign in: emailed code ───────────────────────────────────────────
// Two steps in place: email → we send the code → the code field swaps in.
// Stays in the popup, so a successful sign-in drops straight into the save.
$('form-email').addEventListener('submit', async (e) => {
  e.preventDefault()
  const hint = $('signin-hint')
  const btn = $('btn-email-code')
  const email = $('email').value.trim()
  hint.classList.add('hidden')
  btn.disabled = true
  try {
    await requestEmailCode(email)
    $('form-email').classList.add('hidden')
    $('form-code').classList.remove('hidden')
    setHint(hint, `code sent to ${email}. Check your inbox`, 'ok')
    $('code').focus()
  } catch (err) {
    setHint(hint, String(err.message || err), 'err')
  } finally {
    btn.disabled = false
  }
})

$('form-code').addEventListener('submit', async (e) => {
  e.preventDefault()
  const hint = $('signin-hint')
  const btn = $('btn-code-signin')
  const email = $('email').value.trim()
  const code = $('code').value
  hint.classList.add('hidden')
  btn.disabled = true
  try {
    await verifyEmailCode(email, code)
    await render()
  } catch (err) {
    btn.disabled = false
    setHint(hint, String(err.message || err), 'err')
  }
})

// Back out of the code step (wrong address, or just resend to the same one).
$('btn-code-back').addEventListener('click', () => {
  $('btn-email-lane').classList.add('hidden')
  $('form-code').classList.add('hidden')
  $('form-email').classList.remove('hidden')
  $('code').value = ''
  $('signin-hint').classList.add('hidden')
})

// ── Sign in: Google ─────────────────────────────────────────────────
// Hand off to the background worker — it owns the OAuth flow so login survives
// this popup being destroyed when the Google window steals focus.
function oauth(provider, label) {
  setHint($('signin-hint'), `opening ${label}…`, 'ok')
  chrome.runtime.sendMessage({ type: 'ig-google-signin', provider }).catch(() => {})
  setTimeout(() => window.close(), 400)
}
$('btn-signin').addEventListener('click', () => oauth('google', 'Google'))
$('btn-apple').addEventListener('click', () => oauth('apple', 'Apple'))

// Email is the tertiary lane: a link that opens the field in place.
$('btn-email-lane').addEventListener('click', () => {
  $('btn-email-lane').classList.add('hidden')
  $('form-email').classList.remove('hidden')
  $('email').focus()
})

// New accounts are created on the web's /start wizard.
$('link-create').addEventListener('click', (e) => {
  e.preventDefault()
  openTab(`${CONFIG.API_BASE}/start`)
})

// ── The save ────────────────────────────────────────────────────────
const stage = $('stage')
const plate = $('plate')
const shot = $('shot')

let tab = null
let phase = 'checking'
let port = null
let bookmarkId = null
let refreshed = false
let alreadySaved = false // opened on a page that's already in their Bulletin
let username = null
let lists = [] // [{ id, name, slug }], most recently used first
let memberOf = new Set()
let errorInfo = null
let imageFrom = null // 'shot' | 'meta' | 'saved' | 'lead'
let shotSrc = null
let ogSrc = null

function setPhase(p) {
  phase = p
  stage.dataset.phase = p
}

function openTab(url) {
  chrome.tabs.create({ url })
  window.close()
}

const profileUrl = () => (username ? `${CONFIG.API_BASE}/${username}` : CONFIG.API_BASE)
const listUrl = (l) => (username && l.slug ? `${CONFIG.API_BASE}/${username}/${l.slug}` : null)

// The handle is remembered on the device (USER_KEY) so "View your Bulletin"
// links to your page from the first frame.
// Refreshed from every answer; cleared on sign-out.
const USER_KEY = 'ig_username'
function setUsername(u) {
  if (!u) return
  if (u !== username) chrome.storage.local.set({ [USER_KEY]: u }).catch?.(() => {})
  username = u
  $('profile').href = profileUrl()
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// ── The list picker's clock, on the top hairline ──
// Runs at full pace while they browse and tick lists. Creating a list is the
// exception: it stops while they type a name and while "Saved!" shows, then
// crawls and ramps back to normal over a few seconds (time to tick another).
let clock = null
function startClock(ms, onEnd) {
  stopClock()
  const fill = $('hair-fill')
  const c = { done: 0, last: performance.now(), slows: {}, raf: 0 }
  const tick = (now) => {
    c.done += (now - c.last) * clockPace(c, now)
    c.last = now
    const p = Math.min(1, c.done / ms)
    fill.style.width = `${p * 100}%`
    if (p >= 1) {
      clock = null
      return onEnd()
    }
    c.raf = requestAnimationFrame(tick)
  }
  c.raf = requestAnimationFrame(tick)
  clock = c
}
// Each kind of slowdown eases back on its own; the slowest one sets the pace.
function clockPace(c, now) {
  if (create.classList.contains('editing')) return 0
  let pace = 1
  for (const s of Object.values(c.slows)) {
    const t = now - s.at - s.hold
    const k = t < 0 ? 0 : Math.min(1, t / s.ramp)
    pace = Math.min(pace, s.from + (1 - s.from) * k * k * (3 - 2 * k))
  }
  return pace
}
// Slow the clock to `from`, hold there `hold` ms, then ease to full pace over
// `ramp` ms.
function slowClock(kind, from, hold, ramp) {
  if (clock) clock.slows[kind] = { at: performance.now(), from, hold, ramp }
}
const created = () => slowClock('create', 0.15, 0, 3000) // a crawl, back to normal
function stopClock() {
  if (clock) cancelAnimationFrame(clock.raf)
  clock = null
  $('hair-fill').style.width = '0'
}

function closePopup() {
  stopClock()
  stage.classList.add('closing')
  setTimeout(() => window.close(), 300)
}

// ── Open: the confirm plate ──
async function initSave() {
  if (CARD && CARD_TAB) {
    tab = await chrome.tabs.get(CARD_TAB).catch(() => null)
  } else {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
    tab = active || null
  }
  // Before the save the popup claims nothing about the card: just the mark
  // and "Save this page" on the dotted plate. The title is read during the
  // save and first shows on the finished card.
  $('profile').href = profileUrl()

  // Lists + handle load now, so the picker and the page links are ready
  // before the save lands. A dead session sends us back to sign-in.
  chrome.runtime.sendMessage({ type: 'ig-get-lists' }).then((r) => {
    if (r?.authExpired) return render()
    if (!r || r.error) return
    if (!bookmarkId) lists = r.lists || []
    if (r.username) setUsername(r.username)
    else if (phase === 'confirm') showSetup()
  }, () => {})

  // Signed in, but no Bulletin yet (never picked a handle on /start): the
  // card sends them to finish setup instead of offering a save that fails.
  if (needsSetup) return showSetup()

  // chrome://, the Web Store, the new tab page: nothing to save.
  if (!/^https?:/i.test(tab?.url || '')) {
    setPhase('blocked')
    $('plabel').textContent = 'Can’t save this page'
    $('pmsg').textContent = 'Browser pages can’t be saved.'
    return
  }
  // Already in their Bulletin: the plate shrinks into the picker instead of
  // offering "Save this page".
  setPhase('checking')
  $('plabel').textContent = 'Loading…'
  const ask = chrome.runtime
    .sendMessage({ type: 'ig-check-saved', tabId: tab.id, url: tab.url })
    .then((r) => (r?.bookmark?.id ? r : null), () => null)
  const known = await Promise.race([ask, new Promise((res) => setTimeout(() => res(null), CHECK_WAIT))])
  if (known) return openSaved(known)
  $('plabel').textContent = 'Save this page'
  setPhase('confirm')
  plate.focus({ preventScroll: true })
  ask.then((late) => { if (late && phase === 'confirm') openSaved(late) })
}

// The bullet as it is, its lists ticked: the plate morphs down into the tile.
function openSaved(r) {
  alreadySaved = true
  refreshed = true
  bookmarkId = r.bookmark.id
  if (r.lists) lists = r.lists
  memberOf = new Set(r.memberOf || [])
  setUsername(r.username)
  stage.classList.add('saved')
  decided = true
  if (r.bookmark.image_url) setImage(r.bookmark.image_url, 'lead')
  enterLists()
}

let needsSetup = false
const START_URL = () => `${CONFIG.API_BASE}/start`
function showSetup() {
  setPhase('setup')
  $('plabel').textContent = 'Almost there'
  $('pmsg').textContent = 'Finish setting up your Bulletin to start saving'
  $('profile').textContent = 'Finish setup'
  $('profile').href = START_URL()
}

plate.addEventListener('click', () => {
  if (phase === 'setup') return openTab(START_URL())
  if (phase === 'confirm') return startSave()
  if (phase === 'error') {
    if (errorInfo?.code === 'needs_onboarding') return openTab(START_URL())
    return startSave()
  }
})

// ── The plate's dots ──
// The homepage's animated dot grid (components/home/DotGridCanvas.tsx), in
// miniature: each dot breathes on its own phase and darkens/swells near the
// pointer, with a soft hollow around the mark + label.
//
// Saving is "soft focus" (from spec 2a): the dots dissolve at random across
// the plate while the page's image arrives in full colour but heavily
// blurred (22px), then sharpens in place, never zoomed, to exactly the image
// the <img> shows (cover, top-anchored), which then takes over. The canvas
// only draws the image, never reads its pixels, so a cross-origin og image
// is fine. Reduced motion → the dots are drawn once and the image just lands.
const dots = (() => {
  const W = 336
  const H = 168
  const PITCH = 18
  const POINTER_RADIUS = 90
  const CLEAR = { cy: 84, rx: 108, ry: 64 } // the soft hollow behind the lockup
  const canvas = $('dots')
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // Each dot also carries a stable random threshold (j, hashed from its
  // indices: no flicker) for when soft focus dissolves it.
  const grid = []
  for (let r = 0, y = PITCH / 2; y < H + PITCH; r++, y += PITCH) {
    for (let q = 0, x = PITCH / 2; x < W + PITCH; q++, x += PITCH) {
      const j = Math.abs(Math.sin(q * 12.9898 + r * 78.233) * 43758.5453) % 1
      grid.push({ x, y, j, phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.6 })
    }
  }
  // The lockup's hollow: not a hard clearing, a gradient. Dots thin out
  // toward the B + label (never below 12%), full strength by the edge; `open`
  // (1 at rest → 0 once the save starts) fades the hollow away entirely.
  const hollow = (d, open) => {
    if (open <= 0) return 1
    const e = Math.hypot((d.x - W / 2) / CLEAR.rx, (d.y - CLEAR.cy) / CLEAR.ry)
    return 1 - open * (1 - (0.12 + 0.88 * smooth(0.2, 1.25, e)))
  }
  const easeIO = (x) => {
    x = Math.min(1, Math.max(0, x))
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
  }
  const focus = document.createElement('canvas')
  focus.width = W * dpr
  focus.height = H * dpr

  const mouse = { x: -9999, y: -9999 }
  let img = null // the loaded image the dots merge into
  let imgAt = 0 // when the first image loaded (soft focus's clock starts here)
  let imgSrc = null
  let swapAt = -Infinity // when a later image replaced it (for the crossfade)
  const SWAP_MS = 260
  const prev = document.createElement('canvas')
  prev.width = W * dpr
  prev.height = H * dpr
  let mergeFrom = 0 // when the save started
  // The image, cover-fit at full resolution.
  const full = document.createElement('canvas')
  full.width = W * dpr
  full.height = H * dpr
  let merge = null // 0..1 while saving; null otherwise

  document.addEventListener('mousemove', (e) => {
    const r = plate.getBoundingClientRect()
    mouse.x = e.clientX - r.left
    mouse.y = e.clientY - r.top
  })
  document.addEventListener('mouseleave', () => { mouse.x = mouse.y = -9999 })

  const smooth = (a, b, v) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
    return t * t * (3 - 2 * t)
  }
  const fillFull = () => {
    const f = full.getContext('2d')
    const s = Math.max(full.width / img.naturalWidth, full.height / img.naturalHeight)
    const dw = img.naturalWidth * s
    f.clearRect(0, 0, full.width, full.height)
    f.drawImage(img, (full.width - dw) / 2, 0, dw, img.naturalHeight * s)
  }
  const drawCover = () => ctx.drawImage(full, 0, 0, W, H)
  // The breathing grid dissolving at random, gone by 72%.
  const dissolveDots = (m) => {
    // The hollow fills in as the B + label fade (650ms, from the click).
    const open = merge == null ? 1 : 1 - easeIO((performance.now() - mergeFrom) / 650)
    const time = performance.now() / 1000
    const E = 0.3
    const front = (1 + E) * easeIO(m / 0.72)
    for (const d of grid) {
      if (d.x > W || d.y > H) continue
      const q = m > 0 ? Math.min(1, Math.max(0, (front - d.j) / E)) : 0
      const a = (1 - easeIO(q)) * hollow(d, open)
      if (a <= 0.01) continue
      const idle = (Math.sin(time * d.speed + d.phase) + 1) / 2
      const p = Math.max(0, 1 - Math.hypot(d.x - mouse.x, d.y - mouse.y) / POINTER_RADIUS)
      const shade = Math.max(90, Math.round(222 - idle * 60 - p * 70))
      ctx.globalAlpha = a
      ctx.beginPath()
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`
      ctx.arc(d.x, d.y, (0.9 + idle * 0.3 + p * 0.7) * (1 - 0.4 * q), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // The image (crossfading from the previous one after a swap) with its edge
  // pixels stretched `pad` device px outward on every side.
  // One fixed margin, wide enough for the heaviest blur (22px), so the
  // canvas is never reallocated mid-animation.
  const EDGE = Math.ceil(22 * dpr * 2) + 2
  const ext = document.createElement('canvas')
  ext.width = W * dpr + EDGE * 2
  ext.height = H * dpr + EDGE * 2
  const edgeClamped = (pad) => {
    const w = full.width
    const h = full.height
    const e = ext.getContext('2d')
    e.clearRect(0, 0, ext.width, ext.height)
    const layer = (srcCanvas, alpha) => {
      e.globalAlpha = alpha
      e.drawImage(srcCanvas, pad, pad)
      if (pad > 0) {
        e.drawImage(srcCanvas, 0, 0, 1, h, 0, pad, pad, h) // left
        e.drawImage(srcCanvas, w - 1, 0, 1, h, pad + w, pad, pad, h) // right
        e.drawImage(srcCanvas, 0, 0, w, 1, pad, 0, w, pad) // top
        e.drawImage(srcCanvas, 0, h - 1, w, 1, pad, pad + h, w, pad) // bottom
        e.drawImage(srcCanvas, 0, 0, 1, 1, 0, 0, pad, pad)
        e.drawImage(srcCanvas, w - 1, 0, 1, 1, pad + w, 0, pad, pad)
        e.drawImage(srcCanvas, 0, h - 1, 1, 1, 0, pad + h, pad, pad)
        e.drawImage(srcCanvas, w - 1, h - 1, 1, 1, pad + w, pad + h, pad, pad)
      }
    }
    layer(full, 1)
    const sw = (performance.now() - swapAt) / SWAP_MS
    if (sw < 1) layer(prev, 1 - easeIO(sw))
    e.globalAlpha = 1
    return ext
  }

  const drawSoft = () => {
    const m = img && merge != null ? merge : 0
    dissolveDots(m)
    if (!(m > 0)) return
    // 2. The image: full colour but soft, sharpening from 30%.
    const fp = easeIO((m - 0.3) / 0.7)
    const blur = (1 - fp) * 22 + 0.001
    // No zoom: the image holds still while it sharpens (Tim, 09-28). To keep
    // the blur from pulling white in at the edges, the image's edge pixels are
    // stretched outward into a margin (clamp-to-edge) and the blur runs on
    // that; the picture itself is never scaled.
    const pad = EDGE
    const src = edgeClamped(pad)
    const g = focus.getContext('2d')
    g.clearRect(0, 0, focus.width, focus.height)
    g.filter = `blur(${blur * dpr}px)`
    g.drawImage(src, -pad, -pad)
    g.filter = 'none'
    ctx.globalAlpha = easeIO(m / 0.75)
    ctx.drawImage(focus, 0, 0, W, H)
    ctx.globalAlpha = 1
    // At 1 it must be exactly the image, for the <img> handoff.
    if (m >= 1) drawCover()
  }

  const draw = () => {
    ctx.clearRect(0, 0, W, H)
    drawSoft()
  }

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (still) {
    draw(0)
  } else {
    const loop = (t) => {
      draw(t)
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }
  return {
    // A later image (the og swap from `lead`, or the capture overtaking the
    // og) must not restart the reveal: the clock keeps the FIRST image's
    // start, the same image is ignored, and a different one crossfades in
    // under the blur (prev → full over SWAP_MS).
    setImage(src) {
      if (src === imgSrc) return
      imgSrc = src
      const next = new Image()
      next.onload = () => {
        if (imgSrc !== src) return // superseded while loading
        if (img) {
          const pg = prev.getContext('2d')
          pg.clearRect(0, 0, prev.width, prev.height)
          pg.drawImage(full, 0, 0)
          swapAt = performance.now()
        } else {
          imgAt = performance.now()
        }
        img = next
        fillFull()
      }
      next.src = src
    },
    // 0..1 while saving, null to stop.
    merge(v) {
      if (merge == null && v != null) mergeFrom = performance.now()
      merge = still ? null : v
    },
    hasImage: () => !!img,
    imageAt: () => imgAt,
  }
})()

// ── Saving ──
// Until the save answers, the tab capture wins over the og image: it IS the
// screengrab the plate is showing off. Once the save says which image the
// card will lead with (lead), that one takes the plate, so the popup never
// shows a picture your page won't.
function setImage(src, from) {
  if (!src) return
  if (!decided && (from === 'shot' || from === 'meta')) return // wait for the lead
  if (imageFrom === 'lead') return
  if (imageFrom === 'shot' && from !== 'shot' && from !== 'lead') return
  if (shot.getAttribute('src') === src) {
    imageFrom = from // already showing it: nothing to reload
    return
  }
  const swapping = shot.classList.contains('in') && shot.src && !shot.src.endsWith(src)
  imageFrom = from
  const show = () => {
    shot.src = src
    dots.setImage(src)
    shot.onload = () => {
      shot.classList.remove('swap')
      shot.classList.add('in')
      stage.classList.add('has-shot')
    }
    shot.onerror = () => { if (imageFrom === from) imageFrom = null }
  }
  if (!swapping) return show()
  shot.classList.add('swap')
  setTimeout(show, 160)
}

// The save says which image the card leads with; that (and only that) one
// goes on the plate. Before it answers, nothing is revealed (the dots and the
// fading B carry the first beat), so the plate never shows one picture and
// then switches to another. A slow save (LEAD_WAIT) falls back to the
// capture, and a later swap after that crossfades.
const LEAD_WAIT = 1500
let decided = false
function applyLead(lead, savedImage) {
  decided = true
  const og = ogSrc || savedImage
  const pick = lead === 'og' ? og || shotSrc : shotSrc || og
  if (pick) setImage(pick, 'lead')
}

function startSave() {
  stage.classList.remove('handoff')
  decided = false
  setTimeout(() => {
    if (decided || phase !== 'saving') return
    decided = true
    setImage(shotSrc || ogSrc, 'shot')
  }, LEAD_WAIT)
  setPhase('saving')
  $('plabel').textContent = 'Saving…'
  $('pmsg').textContent = ''
  errorInfo = null
  let saved = false

  try { port?.disconnect() } catch {}
  port = chrome.runtime.connect({ name: 'ig-save' })
  port.onMessage.addListener((m) => {
    if (m.type === 'shot') {
      shotSrc = m.dataUrl
      setImage(m.dataUrl, 'shot')
    } else if (m.type === 'meta') {
      ogSrc = m.image || null
      setImage(m.image, 'meta')
    } else if (m.type === 'saved') {
      bookmarkId = m.bookmark?.id || null
      refreshed = !!m.refreshed
      setUsername(m.username)
      applyLead(m.lead, m.bookmark?.image_url)
      saved = true
    } else if (m.type === 'error') {
      errorInfo = m
    }
  })
  port.postMessage({
    type: 'save',
    card: CARD,
    tab: { id: tab.id, windowId: tab.windowId, url: tab.url, title: tab.title },
  })

  // The beat: the dots merge into the image over SAVE_BEAT, holding at 92% if
  // the save is slower than that, and never finishing before it.
  const t0 = performance.now()
  const frame = (now) => {
    if (errorInfo) return showError(errorInfo)
    let p = Math.min(1, (now - t0) / SAVE_BEAT)
    // Soft focus runs its beat from when the image loads, holding on the
    // dots until then. No image at all: the save just finishes on time.
    // It gets what's left of SAVE_BEAT once the image is known (at least
    // 1.4s), so waiting for the lead doesn't lengthen the save.
    if (dots.hasImage()) {
      const from = Math.max(t0, dots.imageAt())
      p = Math.min(1, (now - from) / Math.max(1400, SAVE_BEAT - (from - t0)))
    } else if (!(saved && p >= 1)) p = Math.min(p, 0)
    if (!saved) p = Math.min(p, 0.92)
    dots.merge(p)
    // Complete: the canvas holds the finished image until the morph hands
    // over to the <img> (it only lets go on error or the next save).
    if (p >= 1 && saved) {
      if (dots.hasImage() && stage.classList.contains('has-shot')) stage.classList.add('handoff')
      return setTimeout(enterLists, 150)
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

function showError(err) {
  dots.merge(null)
  if (err.authExpired) return render()
  setPhase('error')
  if (err.code === 'needs_onboarding') {
    $('plabel').textContent = 'Almost there'
    $('pmsg').textContent = 'Finish setting up your Bulletin, then save again. Click to go there.'
  } else {
    // Show why: a bare "Couldn't save" hid every cause (server error, network,
    // dead session) behind the same words.
    console.error('[bulletin] save failed:', err.message)
    $('plabel').textContent = 'Couldn’t save'
    $('pmsg').textContent = err.message ? `${err.message}. Click to try again` : 'Click to try again'
  }
}

// ── Lists ──
async function enterLists() {
  $('htitle').textContent = refreshed ? 'Already in your Bulletin' : 'Saved to your Bulletin'
  renderRows()
  updateSub()
  stage.classList.add('tall')
  fitLists()
  create.style.setProperty('--i', lists.length)
  stage.classList.add('rows-in')
  setTimeout(() => stage.classList.remove('rows-in'), 40 + (lists.length + 1) * 35 + 400)
  setPhase('lists')
  // They came to look or edit: no countdown hurrying them out.
  if (alreadySaved) return
  startClock(HOLD, finish)

  // A re-save is already filed places: tick the lists it's in.
  if (refreshed && bookmarkId) {
    const r = await chrome.runtime.sendMessage({ type: 'ig-get-lists', bookmarkId }).catch(() => null)
    if (r && !r.error) {
      lists = r.lists || lists
      memberOf = new Set(r.memberOf || [])
      renderRows()
      fitLists()
      updateSub()
    }
  }
}


function selectedNames() {
  return lists.filter((l) => memberOf.has(l.id)).map((l) => l.name)
}

function updateSub() {
  const names = selectedNames()
  $('hsub').textContent = names.length ? `In ${names.join(', ')}` : 'Add it to a list…'
  $('done').textContent = names.length || alreadySaved ? 'Done' : 'Skip'
}

// ── Delete (already saved only) ──
// Delete → Undo in the same spot for a few seconds, then the card closes.
// The worker holds the delete for that window, so Undo just cancels it.
const removeBtn = $('remove')
removeBtn.addEventListener('click', () => (stage.classList.contains('removed') ? undoRemove() : removeBullet()))
function removeBullet() {
  stage.classList.add('removed')
  removeBtn.textContent = 'Undo'
  $('htitle').textContent = 'Deleted from your Bulletin'
  $('hsub').textContent = 'Off your page and out of every list'
  $('done').textContent = 'Done'
  chrome.runtime.sendMessage({ type: 'ig-remove', bookmarkId }).catch(() => {})
  startClock(REMOVE_HOLD, finish)
}
function undoRemove() {
  stopClock()
  stage.classList.remove('removed')
  removeBtn.textContent = 'Delete'
  $('htitle').textContent = 'Already in your Bulletin'
  updateSub()
  chrome.runtime.sendMessage({ type: 'ig-undo-remove', bookmarkId }).catch(() => {})
}

// Expanded: the stage grows to hold header + every row + "Create new list" +
// the button. Past the cap, the rest scrolls (a very long set of lists).
function fitLists() {
  if (!LISTS_EXPAND) return
  const h = 80 + (lists.length + 1) * ROW + 68
  stage.style.setProperty('--stage-h', `${Math.min(POPUP_MAX, h)}px`)
}

function lockGlyph() {
  const wrap = document.createElement('span')
  wrap.className = 'lock'
  wrap.title = 'Private: only you can see this list'
  wrap.innerHTML =
    '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg><span class="sr-only">Private</span>'
  return wrap
}

function renderRows() {
  const rows = $('rows')
  rows.textContent = ''
  for (const l of lists) {
    const r = document.createElement('div')
    r.className = 'row' + (memberOf.has(l.id) ? ' on' : '') + (l.id === freshId ? ' fresh' : '')
    r.setAttribute('role', 'checkbox')
    r.setAttribute('aria-checked', String(memberOf.has(l.id)))
    r.tabIndex = 0
    r.style.setProperty('--i', rows.children.length)

    const name = document.createElement('div')
    name.className = 'rname'
    const label = document.createElement('span')
    label.textContent = l.name
    name.append(label)
    // A private list (migration 033) wears the site's lock: glyph only, 60%.
    if (l.is_private) name.append(lockGlyph())
    const href = listUrl(l)
    if (href) {
      const go = document.createElement('a')
      go.className = 'go'
      go.href = href
      go.textContent = '↗'
      go.title = 'Open this list'
      go.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        openTab(href)
      })
      name.append(go)
    }
    const dot = document.createElement('span')
    dot.className = 'dot'
    r.append(name, dot)

    r.addEventListener('click', () => toggle(l))
    r.addEventListener('keydown', (e) => {
      if (e.key === ' ') { e.preventDefault(); toggle(l) }
    })
    rows.append(r)
  }
}

function toggle(l) {
  const add = !memberOf.has(l.id)
  if (add) memberOf.add(l.id)
  else memberOf.delete(l.id)
  renderRows()
  updateSub()
  chrome.runtime
    .sendMessage({ type: 'ig-set-list', listId: l.id, bookmarkId, add })
    .then((r) => { if (!r || r.error) throw new Error() })
    .catch(() => {
      if (add) memberOf.delete(l.id)
      else memberOf.add(l.id)
      renderRows()
      updateSub()
    })
}

// "Create new list" → a field in place: type, Enter (or click "Create ↵"),
// "Saved!" for a beat, then the new list lands at the top, filed. Typing the
// name of a list they already have files into that one instead of minting a
// near-duplicate. Esc or an empty field backs out.
const create = $('create')
const field = $('lfield')
const hint = $('chint')
let creating = false
let freshId = null
create.addEventListener('click', () => {
  if (create.classList.contains('editing')) return
  create.classList.add('editing')
  field.value = ''
  hint.textContent = 'Create ↵'
  hint.classList.remove('show', 'saved')
  field.focus()
  create.scrollIntoView({ block: 'nearest' })
})
function stopEditing() {
  create.classList.remove('editing', 'done')
  hint.classList.remove('show', 'saved')
  field.value = ''
  field.disabled = false
}
field.addEventListener('input', () => {
  hint.classList.toggle('show', field.value.trim().length > 0)
})
field.addEventListener('keydown', (e) => {
  if (e.isComposing || e.keyCode === 229) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    return stopEditing()
  }
  if (e.key !== 'Enter') return
  e.preventDefault()
  e.stopPropagation()
  commitCreate()
})
// pointerdown, not click: a click would blur the field first, and an empty
// field's blur folds the row away before the click lands.
hint.addEventListener('pointerdown', (e) => {
  e.preventDefault()
  e.stopPropagation()
  commitCreate()
})
field.addEventListener('blur', () => { if (!field.value.trim() && !creating) stopEditing() })

// The new list takes the top row, filed, with a soft flash.
function landList(list) {
  lists = [list, ...lists.filter((l) => l.id !== list.id)]
  memberOf.add(list.id)
  freshId = list.id
  renderRows()
  fitLists()
  updateSub()
  freshId = null
  $('lists').scrollTop = 0
}

async function commitCreate() {
  const name = field.value.trim()
  if (!name || creating) return
  const exact = lists.find((l) => l.name.toLowerCase() === name.toLowerCase())
  if (exact) {
    if (!memberOf.has(exact.id)) toggle(exact)
    stopEditing()
    landList(exact)
    return created()
  }
  creating = true
  field.disabled = true
  hint.textContent = 'Saving…'
  hint.classList.add('show')
  const r = await chrome.runtime
    .sendMessage({ type: 'ig-create-list', name, bookmarkId })
    .catch(() => null)
  creating = false
  if (!r || r.error || !r.list) {
    field.disabled = false
    hint.textContent = 'Couldn’t create. Try again'
    field.focus()
    return
  }
  // "<name>  Saved!" holds for a beat, then the list lands.
  create.classList.add('done')
  hint.textContent = 'Saved!'
  hint.classList.add('saved')
  setTimeout(() => {
    stopEditing()
    landList(r.list)
    created()
  }, 1100)
}

$('done').addEventListener('click', () => finish())

// ── Done → gone ──
function finish() {
  if (phase !== 'lists') return
  closePopup()
}

// ── Links ──
for (const id of ['profile']) {
  $(id).addEventListener('click', (e) => {
    e.preventDefault()
    openTab($(id).href)
  })
}

// ── Keys: Enter saves on the plate, finishes on the picker ──
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target === field) return
  if (phase === 'lists' && e.target.closest?.('.row, .go') == null) {
    e.preventDefault()
    finish()
  }
})

// ── Render based on auth state ──────────────────────────────────────
async function render() {
  // The card only opens signed in, so it starts on its own plate ("Loading…")
  // rather than the popup's bare loading line.
  show(CARD ? 'save' : 'loading')
  if (CARD) {
    const v = await chrome.runtime
      .sendMessage({ type: 'ig-card-verify', tab: CARD_TAB, key: params.get('k') })
      .catch(() => null)
    if (!v?.ok) return window.close()
  }
  const session = await getSession()
  if (!session) return show('signin')
  const { [USER_KEY]: known } = await chrome.storage.local.get(USER_KEY)
  if (known) {
    username = known
    $('profile').href = profileUrl()
  } else {
    // No handle on this device yet: ask before showing anything, so an
    // account that never finished setup gets "Finish setup" straight away,
    // not a Save that fails.
    const r = await Promise.race([
      chrome.runtime.sendMessage({ type: 'ig-get-lists' }).catch(() => null),
      new Promise((res) => setTimeout(() => res(null), 1500)),
    ])
    if (r?.authExpired) return show('signin')
    if (r && !r.error) {
      lists = r.lists || []
      if (r.username) setUsername(r.username)
      else needsSetup = true
    }
  }
  show('save')
  await initSave()
}

render()
