// On-page "gem" toast — injected into the active tab by the background worker.
// Visual treatment mirrors mymind's save card: a clean white rounded card with
// a coral top accent, a circular line-art icon, friendly rounded-sans text, and
// a collapsible "Add to a list" row. Once saved you can add the gem to a list,
// or create + publish a brand-new list inline.
//
// Injected via chrome.scripting.executeScript({ files: [...] }) so it runs as a
// content script in the isolated world: it can use chrome.runtime messaging but
// the page's own scripts can't see it. All UI lives in a shadow root so the
// host page's CSS never leaks in (or out).
//
// Protocol — background → toast (chrome.tabs.sendMessage):
//   { type: 'ig-toast', state: 'saving' }
//   { type: 'ig-toast', state: 'saved',     data: { id, title } }
//   { type: 'ig-toast', state: 'duplicate', data: { title } }
//   { type: 'ig-toast', state: 'error',     data: { message } }
// Protocol — toast → background (chrome.runtime.sendMessage):
//   { type: 'ig-get-lists' }                       → { ok, lists } | { error }
//   { type: 'ig-create-list', name, bookmarkId }   → { ok, list, url } | { error }
//   { type: 'ig-set-list', listId, bookmarkId, add } → { ok } | { error }

;(() => {
  // Guard against double-injection: reuse the existing controller if the user
  // clicks again on the same page.
  if (window.__igToast) {
    window.__igToast.reset()
    return
  }

  const DISMISS_MS = 4000

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
      .lists { border-top: 1px solid #efece6; }
      .lchip {
        all: unset; cursor: pointer; box-sizing: border-box;
        display: inline-flex; align-items: center; gap: 5px;
        font-size: 13px; line-height: 1; color: #1d1d1f;
        background: #f4f2ec; border-radius: 999px; padding: 7px 12px;
        transition: background .15s ease, color .15s ease;
      }
      .lchip:hover { background: #e9e6df; }
      .lchip.on { background: #1d1d1f; color: #fff; }
      .lchip.on::before { content: '✓'; font-size: 11px; }
      .add.suggest::placeholder { color: #f0653f; opacity: .85; }
      .err .msg { color: #d23f3f; }
    </style>
    <div class="card" id="card">
      <div class="accent"></div>
      <div class="head" id="head">
        <span class="icon" id="icon">💎</span>
        <span class="msg" id="msg">One moment, saving…</span>
      </div>
      <div class="title" id="title" style="display:none"></div>
      <div class="lists" id="lists" style="display:none">
        <div class="tagrow" id="listrow">
          <span class="lbl" id="listlbl">Add to a list</span>
          <span class="chev">▾</span>
        </div>
        <div class="tagbody" id="listbody">
          <div class="chips" id="listchips"></div>
        </div>
      </div>
    </div>
  `

  const el = (id) => root.getElementById(id)
  const card = el('card')

  // ── state ──────────────────────────────────────────────────────────
  let bookmarkId = null
  let dismissTimer = null
  let hovering = false
  let editing = false
  // Lists: the user's lists [{ id, name, slug }] and which ones this gem is in.
  let lists = []
  let memberOf = new Set()
  // A "why you saved it" name suggestion for a new list (arrives async, never
  // blocks the card). `userTyped` suppresses it once the user starts typing.
  let suggestedName = null
  let userTyped = false

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

  el('listrow').addEventListener('click', () => toggleLists())

  function clearDismiss() {
    if (dismissTimer) clearTimeout(dismissTimer)
    dismissTimer = null
  }
  function armDismiss(ms = DISMISS_MS) {
    clearDismiss()
    dismissTimer = setTimeout(() => {
      // Stay open while the pointer is over the card, or while the user is
      // mid-thought in the create field. The list input is auto-focused on
      // save, so focus alone shouldn't pin the card open forever — only keep
      // it up if they've actually started typing a name.
      if (hovering || (editing && userTyped)) return armDismiss(1500)
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

  // ── lists ──────────────────────────────────────────────────────────
  function toggleLists(force) {
    const open = force === undefined ? !el('listbody').classList.contains('open') : force
    el('listbody').classList.toggle('open', open)
    el('listrow').classList.toggle('open', open)
    if (open) {
      clearDismiss()
      focusListInput()
    } else {
      armDismiss()
    }
  }

  function updateListLabel() {
    const n = memberOf.size
    el('listlbl').textContent = n ? `In ${n} list${n === 1 ? '' : 's'}` : 'Add to a list'
  }

  function focusListInput() {
    const input = root.querySelector('#listchips .add')
    if (input && el('listbody').classList.contains('open')) input.focus()
  }

  function renderLists() {
    updateListLabel()
    const wrap = el('listchips')
    wrap.innerHTML = ''
    for (const l of lists) {
      const chip = document.createElement('button')
      chip.className = 'lchip' + (memberOf.has(l.id) ? ' on' : '')
      chip.textContent = l.name
      chip.addEventListener('click', (e) => {
        e.stopPropagation()
        toggleListMembership(l)
      })
      wrap.appendChild(chip)
    }
    const input = document.createElement('input')
    input.className = 'add' + (suggestedName ? ' suggest' : '')
    input.placeholder = suggestedName
      ? `${suggestedName} — press ↵`
      : lists.length ? 'or create a list…' : 'create a list…'
    input.addEventListener('focus', () => { editing = true; clearDismiss() })
    input.addEventListener('blur', () => { editing = false; armDismiss() })
    input.addEventListener('input', () => { userTyped = !!input.value })
    input.addEventListener('keydown', (e) => {
      // Tab accepts the suggestion into the field so it can be tweaked.
      if (e.key === 'Tab' && suggestedName && !input.value.trim()) {
        e.preventDefault()
        input.value = suggestedName
        input.classList.remove('suggest')
        userTyped = true
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const typed = input.value.trim()
        // Enter on an empty field accepts the ghost-text suggestion.
        if (!typed && suggestedName) return createListByName(suggestedName)
        createListFromInput(input)
      }
    })
    wrap.appendChild(input)
  }

  // Optimistically toggle, then reconcile with the server (revert on failure).
  function toggleListMembership(l) {
    if (!bookmarkId) return
    const add = !memberOf.has(l.id)
    if (add) memberOf.add(l.id)
    else memberOf.delete(l.id)
    renderLists()
    chrome.runtime.sendMessage(
      { type: 'ig-set-list', listId: l.id, bookmarkId, add },
      (resp) => {
        if (!resp || resp.error) {
          if (add) memberOf.delete(l.id)
          else memberOf.add(l.id)
          renderLists()
        }
      }
    )
  }

  function createListFromInput(input) {
    const name = input.value.trim()
    if (!name) return
    input.value = ''
    createListByName(name)
  }

  // Create + publish a list and add this gem to it. Used by both the typed
  // input and one-tap acceptance of the suggested name.
  function createListByName(name) {
    if (!name || !bookmarkId) return
    chrome.runtime.sendMessage(
      { type: 'ig-create-list', name, bookmarkId },
      (resp) => {
        if (resp && resp.ok && resp.list) {
          lists.unshift(resp.list)
          memberOf.add(resp.list.id)
          suggestedName = null // consumed
          renderLists()
          focusListInput()
        }
      }
    )
  }

  // Ask the backend for a "why you saved it" list-name suggestion. Fire-and-
  // forget: if it never returns, the card is unaffected. Only surfaces if the
  // user hasn't typed or already filed the gem into a list.
  function loadSuggestion() {
    if (!bookmarkId) return
    chrome.runtime.sendMessage({ type: 'ig-suggest-name', bookmarkId }, (resp) => {
      if (!resp || !resp.ok || !resp.name) return
      if (userTyped || memberOf.size) return
      suggestedName = resp.name
      // Update the live input in place if it's empty (keeps focus); otherwise
      // re-render to attach the ghost text.
      const input = root.querySelector('#listchips .add')
      if (input && !input.value) {
        input.placeholder = `${suggestedName} — press ↵`
        input.classList.add('suggest')
      } else {
        renderLists()
      }
    })
  }

  function loadLists() {
    chrome.runtime.sendMessage({ type: 'ig-get-lists' }, (resp) => {
      if (resp && resp.ok && Array.isArray(resp.lists)) {
        lists = resp.lists
        renderLists()
      }
    })
  }

  function showSaved(data) {
    setSpinner(false)
    setMsg('Saved to your gems')
    bookmarkId = data && data.id
    if (data && data.title) {
      el('title').textContent = data.title
      el('title').style.display = ''
    }
    if (bookmarkId) {
      // Add the gem to a list (or create + publish a new one) right here.
      el('lists').style.display = ''
      memberOf = new Set()
      renderLists() // lists were prefetched at save time — show whatever's loaded
      loadSuggestion()
      toggleLists(true)
    }
    armDismiss()
  }

  // ── controller exposed to background messages ──────────────────────
  function reset() {
    clearDismiss()
    bookmarkId = null
    editing = false
    lists = []
    memberOf = new Set()
    suggestedName = null
    userTyped = false
    el('title').style.display = 'none'
    el('lists').style.display = 'none'
    toggleLists(false)
    card.classList.remove('err')
    setSpinner(true)
    setMsg('One moment, saving…')
    // Prefetch the user's lists now, in parallel with the save round-trip, so
    // the chips are ready the instant the gem lands instead of after a second
    // sequential request.
    loadLists()
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
  // First injection in a tab doesn't go through reset(); kick off the list
  // prefetch here so it overlaps the in-flight save round-trip.
  loadLists()

  chrome.runtime.onMessage.addListener((m) => {
    if (m && m.type === 'ig-toast' && window.__igToast) {
      window.__igToast.apply(m.state, m.data)
    }
  })
})()
