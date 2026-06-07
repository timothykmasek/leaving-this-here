// On-page "gem" toast — injected into the active tab by the background worker.
// Visual treatment mirrors mymind's save card: a clean white rounded card with
// a coral top accent, a circular line-art icon, friendly rounded-sans text, and
// a collapsible "Add tags" row. Once saved you can add/remove tags inline.
//
// Injected via chrome.scripting.executeScript({ files: [...] }) so it runs as a
// content script in the isolated world: it can use chrome.runtime messaging but
// the page's own scripts can't see it. All UI lives in a shadow root so the
// host page's CSS never leaks in (or out).
//
// Protocol — background → toast (chrome.tabs.sendMessage):
//   { type: 'ig-toast', state: 'saving' }
//   { type: 'ig-toast', state: 'saved',     data: { id, title, tags } }
//   { type: 'ig-toast', state: 'duplicate', data: { title } }
//   { type: 'ig-toast', state: 'error',     data: { message } }
// Protocol — toast → background (chrome.runtime.sendMessage):
//   { type: 'ig-update-tags', id, tags }   → { ok, tags } | { error }

;(() => {
  // Guard against double-injection: reuse the existing controller if the user
  // clicks again on the same page.
  if (window.__igToast) {
    window.__igToast.reset()
    return
  }

  const DISMISS_MS = 6000

  const host = document.createElement('div')
  host.id = 'internet-gems-toast-host'
  // `all:initial` MUST come first — it resets every property, so anything after
  // it (the positioning) survives. Put it last and it wipes out position:fixed,
  // dropping the card into normal flow at the bottom of the page.
  host.style.cssText =
    'all:initial;position:fixed;top:16px;right:16px;z-index:2147483647;'
  const root = host.attachShadow({ mode: 'open' })

  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .card {
        font-family: ui-rounded, 'SF Pro Rounded', system-ui, -apple-system,
          'Segoe UI', Roboto, sans-serif;
        width: 340px;
        background: #fff;
        color: #1d1d1f;
        border-radius: 18px;
        box-shadow: 0 16px 40px rgba(20,20,30,0.20), 0 2px 8px rgba(20,20,30,0.10);
        overflow: hidden;
        transform: translateX(120%);
        opacity: 0;
        transition: transform .32s cubic-bezier(.2,.85,.25,1), opacity .32s ease;
      }
      .card.in { transform: translateX(0); opacity: 1; }
      .accent { height: 5px; background: linear-gradient(90deg,#ff7a4d,#f0653f); }
      .head { display: flex; align-items: center; gap: 13px; padding: 16px 18px; }
      .icon {
        flex: none; width: 38px; height: 38px; border-radius: 50%;
        border: 1.5px solid #d9d6cf; display: flex; align-items: center;
        justify-content: center; font-size: 18px; line-height: 1; color: #1d1d1f;
      }
      .msg { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; flex: 1; }
      .spin {
        width: 16px; height: 16px; border-radius: 50%;
        border: 2px solid #e4e1da; border-top-color: #f0653f;
        animation: spin .7s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .title {
        font-size: 13.5px; color: #86868b; line-height: 1.4;
        padding: 0 18px 14px 69px; margin-top: -6px;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .tags { border-top: 1px solid #efece6; }
      .tagrow {
        display: flex; align-items: center; justify-content: space-between;
        padding: 13px 18px; cursor: pointer; user-select: none;
      }
      .tagrow .lbl { font-size: 15px; color: #6e6e73; }
      .chev { font-size: 13px; color: #b9b6af; transition: transform .2s ease; }
      .tagrow.open .chev { transform: rotate(180deg); }
      .tagbody { padding: 0 16px 14px; display: none; }
      .tagbody.open { display: block; }
      .chips { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
      .chip {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 13px; line-height: 1; color: #1d1d1f;
        background: #f4f2ec; border-radius: 999px; padding: 7px 9px 7px 12px;
      }
      .chip button {
        all: unset; cursor: pointer; font-size: 14px; color: #b0aca2;
        line-height: 1; padding: 0 1px;
      }
      .chip button:hover { color: #f0653f; }
      .add {
        all: unset; cursor: text; font-family: inherit; font-size: 13px;
        color: #1d1d1f; min-width: 90px; flex: 1; padding: 7px 4px;
      }
      .add::placeholder { color: #b9b6af; }
      .err .msg { color: #d23f3f; }
    </style>
    <div class="card" id="card">
      <div class="accent"></div>
      <div class="head" id="head">
        <span class="icon" id="icon">💎</span>
        <span class="msg" id="msg">One moment, saving…</span>
      </div>
      <div class="title" id="title" style="display:none"></div>
      <div class="tags" id="tags" style="display:none">
        <div class="tagrow" id="tagrow">
          <span class="lbl" id="taglbl">Add tags</span>
          <span class="chev">▾</span>
        </div>
        <div class="tagbody" id="tagbody">
          <div class="chips" id="chips"></div>
        </div>
      </div>
    </div>
  `

  const el = (id) => root.getElementById(id)
  const card = el('card')

  // ── state ──────────────────────────────────────────────────────────
  let bookmarkId = null
  let tags = []
  let dismissTimer = null
  let hovering = false
  let editing = false
  let saveTagsTimer = null

  document.documentElement.appendChild(host)
  requestAnimationFrame(() => card.classList.add('in'))

  card.addEventListener('mouseenter', () => {
    hovering = true
    clearDismiss()
  })
  card.addEventListener('mouseleave', () => {
    hovering = false
    armDismiss()
  })

  el('tagrow').addEventListener('click', () => toggleTags())

  function clearDismiss() {
    if (dismissTimer) clearTimeout(dismissTimer)
    dismissTimer = null
  }
  function armDismiss(ms = DISMISS_MS) {
    clearDismiss()
    dismissTimer = setTimeout(() => {
      if (hovering || editing) return armDismiss(1500)
      dismiss()
    }, ms)
  }
  function dismiss() {
    clearDismiss()
    card.classList.remove('in')
    setTimeout(() => host.remove(), 340)
    window.__igToast = null
  }

  // ── rendering ──────────────────────────────────────────────────────
  function setMsg(msg) {
    el('msg').textContent = msg
  }
  function setIcon(html) {
    el('icon').innerHTML = html
  }
  function setSpinner(on) {
    setIcon(on ? '<span class="spin"></span>' : '💎')
  }

  function toggleTags(force) {
    const open = force === undefined ? !el('tagbody').classList.contains('open') : force
    el('tagbody').classList.toggle('open', open)
    el('tagrow').classList.toggle('open', open)
    if (open) {
      clearDismiss()
      focusInput()
    } else {
      armDismiss()
    }
  }

  function updateTagLabel() {
    const n = tags.length
    el('taglbl').textContent = n ? `${n} tag${n === 1 ? '' : 's'}` : 'Add tags'
  }

  function renderChips() {
    updateTagLabel()
    const chips = el('chips')
    chips.innerHTML = ''
    for (const tag of tags) {
      const chip = document.createElement('span')
      chip.className = 'chip'
      const text = document.createElement('span')
      text.textContent = tag
      const x = document.createElement('button')
      x.textContent = '×'
      x.title = 'remove'
      x.addEventListener('click', (e) => {
        e.stopPropagation()
        tags = tags.filter((t) => t !== tag)
        renderChips()
        focusInput()
        queueSave()
      })
      chip.append(text, x)
      chips.appendChild(chip)
    }
    const input = document.createElement('input')
    input.className = 'add'
    input.placeholder = tags.length ? 'add a tag…' : 'add tags…'
    input.addEventListener('focus', () => {
      editing = true
      clearDismiss()
    })
    input.addEventListener('blur', () => {
      editing = false
      armDismiss()
    })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        commit(input)
      } else if (e.key === 'Backspace' && !input.value && tags.length) {
        tags = tags.slice(0, -1)
        renderChips()
        focusInput()
        queueSave()
      }
    })
    chips.appendChild(input)
  }

  function focusInput() {
    const input = root.querySelector('.add')
    if (input && el('tagbody').classList.contains('open')) input.focus()
  }

  function commit(input) {
    const raw = input.value.trim().replace(/,$/, '').trim()
    if (raw && !tags.some((t) => t.toLowerCase() === raw.toLowerCase())) {
      tags.push(raw.slice(0, 40))
    }
    input.value = ''
    renderChips()
    focusInput()
    queueSave()
  }

  // Debounce tag persistence so rapid edits collapse into one request.
  function queueSave() {
    if (!bookmarkId) return
    if (saveTagsTimer) clearTimeout(saveTagsTimer)
    saveTagsTimer = setTimeout(persistTags, 600)
  }
  function persistTags() {
    if (!bookmarkId) return
    chrome.runtime.sendMessage(
      { type: 'ig-update-tags', id: bookmarkId, tags: tags.slice() },
      (resp) => {
        if (resp && resp.ok && Array.isArray(resp.tags) && !editing) {
          tags = resp.tags
          renderChips()
        }
      }
    )
  }

  function showSaved(data) {
    setSpinner(false)
    setMsg('Saved to your gems')
    bookmarkId = data && data.id
    tags = (data && Array.isArray(data.tags) ? data.tags : []).slice()
    if (data && data.title) {
      el('title').textContent = data.title
      el('title').style.display = ''
    }
    if (bookmarkId) {
      el('tags').style.display = ''
      renderChips()
      // Open the tag drawer when Claude already applied tags, so they're
      // visible; leave it collapsed (mymind-style) when there are none.
      toggleTags(tags.length > 0)
    }
    armDismiss()
  }

  // ── controller exposed to background messages ──────────────────────
  function reset() {
    clearDismiss()
    bookmarkId = null
    tags = []
    editing = false
    el('title').style.display = 'none'
    el('tags').style.display = 'none'
    toggleTags(false)
    card.classList.remove('err')
    setSpinner(true)
    setMsg('One moment, saving…')
    card.classList.add('in')
  }

  window.__igToast = {
    reset,
    apply(state, data) {
      if (state === 'saving') {
        reset()
      } else if (state === 'saved') {
        showSaved(data)
      } else if (state === 'duplicate') {
        setSpinner(false)
        setMsg('Already in your gems')
        if (data && data.title) {
          el('title').textContent = data.title
          el('title').style.display = ''
        }
        armDismiss()
      } else if (state === 'error') {
        setSpinner(false)
        card.classList.add('err')
        setIcon('⚠')
        setMsg((data && data.message) || 'Could not save')
        armDismiss()
      }
    },
  }

  setSpinner(true)

  chrome.runtime.onMessage.addListener((m) => {
    if (m && m.type === 'ig-toast' && window.__igToast) {
      window.__igToast.apply(m.state, m.data)
    }
  })
})()
