import { getSession, signIn, signOut, getRedirectUri } from './auth.js'

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

// ── Sign in ─────────────────────────────────────────────────────────
document.getElementById('btn-signin').addEventListener('click', async () => {
  const hint = document.getElementById('signin-hint')
  hint.classList.add('hidden')
  try {
    await signIn()
    await setPopupFor(true)
    // Give instant "logged in AND saving" feedback: kick off a save of the
    // page the user was on, then close. The on-page toast confirms it.
    setHint(hint, 'signed in ✓ — saving this page…', 'ok')
    chrome.runtime.sendMessage({ type: 'ig-save-current-tab' }).catch(() => {})
    setTimeout(() => window.close(), 900)
  } catch (err) {
    const msg = String(err.message || err)
    const extra = msg.toLowerCase().includes('redirect')
      ? ` Add this to Supabase → Auth → URL Configuration → Redirect URLs: ${getRedirectUri()}`
      : ''
    setHint(hint, msg + extra, 'err')
  }
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
