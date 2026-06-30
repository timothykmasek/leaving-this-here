import { getSession, signInWithPassword, signOut } from './auth.js'
import { CONFIG } from './config.js'

const views = {
  loading: document.getElementById('view-loading'),
  signin: document.getElementById('view-signin'),
  ready: document.getElementById('view-ready'),
}

function show(name) {
  for (const [k, el] of Object.entries(views)) el.classList.toggle('hidden', k !== name)
}

function setHint(el, msg, kind) {
  el.textContent = msg
  el.classList.remove('hidden', 'ok', 'err')
  if (kind) el.classList.add(kind)
}

// Signed in → clear the popup so future icon clicks save directly (handled in
// the background worker). Signed out → restore it so the click opens sign-in.
async function setPopupFor(session) {
  await chrome.action.setPopup({ popup: session ? '' : 'popup.html' })
}

// ── Sign in: email + password ───────────────────────────────────────
// Stays in the popup (no external window), so we can show inline feedback and
// save the current page before closing — same UX the Google flow couldn't keep.
document.getElementById('form-email').addEventListener('submit', async (e) => {
  e.preventDefault()
  const hint = document.getElementById('signin-hint')
  const btn = document.getElementById('btn-email-signin')
  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  hint.classList.add('hidden')
  btn.disabled = true
  try {
    await signInWithPassword(email, password)
    await setPopupFor(true)
    setHint(hint, 'signed in ✓ — saving this page…', 'ok')
    chrome.runtime.sendMessage({ type: 'ig-save-current-tab' }).catch(() => {})
    setTimeout(() => window.close(), 900)
  } catch (err) {
    btn.disabled = false
    setHint(hint, String(err.message || err), 'err')
  }
})

// ── Sign in: Google ─────────────────────────────────────────────────
// Hand off to the background worker — it owns the OAuth flow so login survives
// this popup being destroyed when the Google window steals focus (see
// background.js). We just fire it and close; the worker confirms via a
// notification and saves the current page.
document.getElementById('btn-signin').addEventListener('click', () => {
  const hint = document.getElementById('signin-hint')
  setHint(hint, 'opening Google…', 'ok')
  chrome.runtime.sendMessage({ type: 'ig-google-signin' }).catch(() => {})
  setTimeout(() => window.close(), 400)
})

// New accounts are created on the web (handles email confirmation, handle
// claim, onboarding) — the extension only signs existing users in.
document.getElementById('link-create').addEventListener('click', (e) => {
  e.preventDefault()
  chrome.tabs.create({ url: `${CONFIG.API_BASE}/login` })
})

// ── Sign out ────────────────────────────────────────────────────────
document.getElementById('btn-signout').addEventListener('click', async () => {
  await signOut()
  await setPopupFor(false)
  await render()
})

// ── Render based on auth state ──────────────────────────────────────
async function render() {
  show('loading')
  const session = await getSession()
  show(session ? 'ready' : 'signin')
}

render()
