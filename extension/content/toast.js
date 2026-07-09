// On-page "bullet" toast — injected into the active tab by the background worker.
// Editorial treatment matching the web app: a clean white rounded card, the
// brand fonts (Cardo + Routed Gothic Wide), a white/grey/ink palette (no accent
// colour), and a collapsible "Add to a list" row that separates your existing
// lists from creating a new one. Once saved you can add the bullet to a list,
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

  const DISMISS_MS = 2500

  // Compact "saved" badge — the Bulletin "bullet": a grey dot (same mark as the
  // toolbar icon, minus its tile). Shown when a save lands.
  const MARK =
    '<svg viewBox="0 0 28 28" width="24" height="24" aria-hidden="true">' +
    '<circle cx="14" cy="14" r="10" fill="#C1C1C1"/></svg>'

  // Self-hosted brand fonts (declared in manifest web_accessible_resources).
  // chrome.runtime.getURL yields the extension-origin URL the page can fetch
  // even from inside the shadow DOM.
  const FONT_CARDO = chrome.runtime.getURL('fonts/Cardo-Regular.woff2')
  const FONT_CARDO_BOLD = chrome.runtime.getURL('fonts/Cardo-Bold.woff2')
  const FONT_LABEL = chrome.runtime.getURL('fonts/RoutedGothicWide-Regular.woff2')

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
      @font-face { font-family:'Cardo'; src:url('${FONT_CARDO}') format('woff2'); font-weight:400; font-display:swap; }
      @font-face { font-family:'Cardo'; src:url('${FONT_CARDO_BOLD}') format('woff2'); font-weight:700; font-display:swap; }
      @font-face { font-family:'Routed Gothic Wide'; src:url('${FONT_LABEL}') format('woff2'); font-weight:400; font-display:swap; }
      :host { all: initial; }
      * { box-sizing: border-box; }
      .card {
        font-family: 'Cardo', Georgia, 'Times New Roman', serif;
        width: 340px;
        background: #ffffff;
        color: #2b2b2b;
        border: 1px solid rgba(43,43,43,0.10);
        border-radius: 16px;
        box-shadow: 0 16px 40px rgba(20,20,30,0.16), 0 2px 8px rgba(20,20,30,0.08);
        overflow: hidden;
        transform: translateX(120%);
        opacity: 0;
        transition: transform .32s cubic-bezier(.2,.85,.25,1), opacity .32s ease;
      }
      .card.in { transform: translateX(0); opacity: 1; }
      .head { display: flex; align-items: center; gap: 12px; padding: 16px 18px; }
      .icon {
        flex: none; width: 34px; height: 34px; display: flex; align-items: center;
        justify-content: center; overflow: hidden; color: #2b2b2b;
      }
      .icon:empty { display: none; }
      .icon img { width: 100%; height: 100%; object-fit: contain; }
      .msg { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; flex: 1; }
      .spin {
        width: 16px; height: 16px; border-radius: 50%;
        border: 2px solid #e6e6e6; border-top-color: #2b2b2b;
        animation: spin .7s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .title {
        font-size: 14px; color: #8a8a8a; line-height: 1.4;
        padding: 0 18px 15px; margin-top: -8px;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden;
      }
      /* Label spec — Routed Gothic Wide, uppercase, tracked (matches the web app). */
      .label { font-family:'Routed Gothic Wide', ui-monospace, monospace; text-transform:uppercase; letter-spacing:1.5px; }
      .lists { border-top: 1px solid rgba(43,43,43,0.08); }
      .listrow {
        display: flex; align-items: center; justify-content: space-between;
        padding: 13px 18px; cursor: pointer; user-select: none;
      }
      .listrow .label { font-size: 11px; color: #2b2b2b; }
      .chev { font-size: 12px; color: #b0b0b0; transition: transform .2s ease; }
      .listrow.open .chev { transform: rotate(180deg); }
      .listbody { padding: 2px 18px 16px; display: none; }
      .listbody.open { display: block; }
      .section + .section { margin-top: 16px; }
      .section-label { display: block; font-size: 9px; color: #a0a0a0; margin-bottom: 9px; }
      .chips { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
      /* Existing-list toggle chip. Selected = filled ink; unselected = grey. */
      .lchip {
        all: unset; cursor: pointer; box-sizing: border-box;
        display: inline-flex; align-items: center; gap: 6px;
        font-family:'Routed Gothic Wide', ui-monospace, monospace;
        text-transform: uppercase; letter-spacing: 1px; font-size: 10px;
        color: #2b2b2b; background: #f1f1f1; border-radius: 999px; padding: 8px 12px;
        transition: background .15s ease, color .15s ease;
      }
      .lchip:hover { background: #e6e6e6; }
      .lchip.on { background: #2b2b2b; color: #fff; }
      .lchip.on::before { content: '✓'; font-size: 10px; }
      /* Create-new field — full-width, clearly its own input. */
      .add {
        all: unset; box-sizing: border-box; cursor: text; width: 100%;
        font-family:'Cardo', Georgia, serif; font-size: 15px; color: #2b2b2b;
        background: #f1f1f1; border-radius: 10px; padding: 10px 12px;
      }
      .add::placeholder { color: #a0a0a0; }
      /* AI name suggestion — a distinct tappable row, ink/grey only (no accent). */
      .suggestion {
        all: unset; cursor: pointer; box-sizing: border-box; width: 100%;
        display: flex; align-items: center; gap: 9px; margin-top: 9px;
        padding: 10px 12px; border-radius: 10px; border: 1px dashed rgba(43,43,43,0.22);
        font-family:'Cardo', Georgia, serif; font-size: 14px; color: #2b2b2b;
      }
      .suggestion:hover { background: #f7f7f7; }
      .suggestion[hidden] { display: none; }
      .suggestion .sg-label { font-family:'Routed Gothic Wide', monospace; text-transform:uppercase; letter-spacing:1px; font-size:9px; color:#a0a0a0; flex:none; }
      .suggestion .sg-name { font-style: italic; }
      .err .msg { color: #2b2b2b; }
    </style>
    <div class="card" id="card">
      <div class="head" id="head">
        <span class="icon" id="icon"></span>
        <span class="msg" id="msg">One moment, saving…</span>
      </div>
      <div class="title" id="title" style="display:none"></div>
      <div class="lists" id="lists" style="display:none">
        <div class="listrow" id="listrow">
          <span class="label" id="listlbl">Add to a list</span>
          <span class="chev">▾</span>
        </div>
        <div class="listbody" id="listbody">
          <div class="section" id="existing" style="display:none">
            <span class="section-label label">Your lists — tap to add</span>
            <div class="chips" id="listchips"></div>
          </div>
          <div class="section">
            <span class="section-label label">Create a new list</span>
            <input class="add" id="addinput" placeholder="Name a new list…" />
            <button class="suggestion" id="suggestion" hidden>
              <span class="sg-label">Suggested</span>
              <span class="sg-name" id="sgname"></span>
            </button>
          </div>
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

  // Create-list input is static markup now (not re-rendered), so focus survives
  // chip re-renders and the async name suggestion.
  const addInput = el('addinput')
  addInput.addEventListener('focus', () => { editing = true; clearDismiss() })
  addInput.addEventListener('blur', () => { editing = false; armDismiss() })
  addInput.addEventListener('input', () => { userTyped = !!addInput.value })
  addInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const typed = addInput.value.trim()
    if (typed) { addInput.value = ''; userTyped = false; createListByName(typed) }
    else if (suggestedName) createListByName(suggestedName)
  })
  el('suggestion').addEventListener('click', (e) => {
    e.stopPropagation()
    if (suggestedName) createListByName(suggestedName)
  })

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
    setIcon(on ? '<span class="spin"></span>' : MARK)
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
    if (el('listbody').classList.contains('open')) addInput.focus()
  }

  // Existing-list toggle chips only. The create field + suggestion are static
  // markup (updated by updateSuggestion), so re-rendering chips never steals
  // focus from someone mid-type.
  function renderLists() {
    updateListLabel()
    const existing = el('existing')
    const wrap = el('listchips')
    wrap.innerHTML = ''
    if (!lists.length) {
      existing.style.display = 'none'
      return
    }
    existing.style.display = ''
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
  }

  // Show the AI "why you saved it" suggestion as its own tappable row — only
  // while the user hasn't typed a name or already filed it into a list.
  function updateSuggestion() {
    const btn = el('suggestion')
    if (suggestedName && !userTyped && !memberOf.size) {
      el('sgname').textContent = `“${suggestedName}”`
      btn.hidden = false
    } else {
      btn.hidden = true
    }
  }

  // Optimistically toggle, then reconcile with the server (revert on failure).
  function toggleListMembership(l) {
    if (!bookmarkId) return
    const add = !memberOf.has(l.id)
    if (add) memberOf.add(l.id)
    else memberOf.delete(l.id)
    renderLists()
    updateSuggestion()
    chrome.runtime.sendMessage(
      { type: 'ig-set-list', listId: l.id, bookmarkId, add },
      (resp) => {
        if (!resp || resp.error) {
          if (add) memberOf.delete(l.id)
          else memberOf.add(l.id)
          renderLists()
          updateSuggestion()
        }
      }
    )
  }

  // Create + publish a list and add this bullet to it. Used by the typed input
  // and one-tap acceptance of the suggested name.
  function createListByName(name) {
    if (!name || !bookmarkId) return
    chrome.runtime.sendMessage(
      { type: 'ig-create-list', name, bookmarkId },
      (resp) => {
        if (resp && resp.ok && resp.list) {
          lists.unshift(resp.list)
          memberOf.add(resp.list.id)
          suggestedName = null // consumed
          addInput.value = ''
          renderLists()
          updateSuggestion()
          focusListInput()
        }
      }
    )
  }

  // Ask the backend for a "why you saved it" list-name suggestion. Fire-and-
  // forget: if it never returns, the card is unaffected.
  function loadSuggestion() {
    if (!bookmarkId) return
    chrome.runtime.sendMessage({ type: 'ig-suggest-name', bookmarkId }, (resp) => {
      if (!resp || !resp.ok || !resp.name) return
      if (userTyped || memberOf.size) return
      suggestedName = resp.name
      updateSuggestion()
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
    setMsg('Saved to your bullets')
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
    addInput.value = ''
    updateSuggestion()
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
        setMsg('Already in your bullets')
        if (data && data.title) {
          el('title').textContent = data.title
          el('title').style.display = ''
        }
        armDismiss()
      } else if (state === 'signin') {
        // Session expired mid-save — invite a re-sign-in instead of showing the
        // raw auth error. Neutral ink styling (reuses .err, which is just ink,
        // no red) and no ⚠ glyph, so it reads as a gentle prompt, not a fault.
        setSpinner(false)
        card.classList.add('err')
        setIcon('')
        setMsg('Session expired — sign in to save')
        el('title').textContent = 'Click the Bulletin icon to sign in again.'
        el('title').style.display = ''
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
