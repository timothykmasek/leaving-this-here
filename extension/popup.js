import { getSession, signIn, signOut, saveGem, getRedirectUri } from './auth.js'

const views = {
  loading: document.getElementById('view-loading'),
  signin: document.getElementById('view-signin'),
  save: document.getElementById('view-save'),
}

function show(name) {
  for (const [k, el] of Object.entries(views)) el.classList.toggle('hidden', k !== name)
}

let currentTab = null

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

function setHint(el, msg, kind) {
  el.textContent = msg
  el.classList.remove('hidden', 'ok', 'err')
  if (kind) el.classList.add(kind)
}

// ── Sign-in view ────────────────────────────────────────────────────
document.getElementById('btn-signin').addEventListener('click', async () => {
  const hint = document.getElementById('signin-hint')
  hint.classList.add('hidden')
  try {
    await signIn()
    await render()
  } catch (err) {
    const msg = String(err.message || err)
    // The classic first-run snag: redirect URL not in Supabase's allow-list.
    const extra = msg.toLowerCase().includes('redirect')
      ? ` Add this to Supabase → Auth → URL Configuration → Redirect URLs: ${getRedirectUri()}`
      : ''
    setHint(hint, msg + extra, 'err')
  }
})

// ── Save view ───────────────────────────────────────────────────────
document.getElementById('btn-signout').addEventListener('click', async () => {
  await signOut()
  await render()
})

document.getElementById('btn-save').addEventListener('click', async () => {
  const btn = document.getElementById('btn-save')
  const status = document.getElementById('status')
  const note = document.getElementById('note').value.trim()

  btn.disabled = true
  btn.textContent = 'saving…'
  status.classList.add('hidden')

  try {
    const result = await saveGem({
      url: currentTab.url,
      title: currentTab.title,
      note: note || undefined,
    })
    btn.textContent = 'saved ✓'
    btn.classList.add('ok')
    const tags = result?.bookmark?.tags
    setHint(
      status,
      tags && tags.length ? `tagged: ${tags.join(', ')}` : 'added to your collection',
      'ok'
    )
    setTimeout(() => window.close(), 1200)
  } catch (err) {
    const msg = String(err.message || err)
    btn.disabled = false
    btn.textContent = 'save 💎'
    if (msg.includes('already saved')) {
      setHint(status, 'you already saved this one', 'ok')
    } else {
      setHint(status, msg, 'err')
    }
  }
})

// ── Render based on auth state ──────────────────────────────────────
async function render() {
  show('loading')
  const session = await getSession()
  if (!session) {
    show('signin')
    return
  }

  currentTab = await getActiveTab()
  document.getElementById('preview-title').textContent = currentTab?.title || '(untitled)'
  document.getElementById('preview-url').textContent = currentTab?.url || ''
  const btn = document.getElementById('btn-save')
  btn.disabled = false
  btn.classList.remove('ok')
  btn.textContent = 'save 💎'
  document.getElementById('status').classList.add('hidden')
  show('save')
}

render()
