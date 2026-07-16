// On-page "Saved to your Bulletin" toast — injected into the active tab by the
// background worker. Two stacked cards (design_handoff_saved_toast):
//   1. Confirmation card — a quiet grey bar that loads along the bottom edge to
//      signal the auto-dismiss, the brand "bullet" dot, and the serif title.
//   2. List combobox — an "Add to a list" field that expands into a filterable
//      panel: tap an existing list to file the bullet, or type + Enter to create
//      and publish a new one. Filing is optional — doing nothing is a finished
//      save.
//
// Design principle: saving is already complete; the list field is a low-friction
// offer, never a requirement.
//
// Injected via chrome.scripting.executeScript({ files: [...] }) so it runs as a
// content script in the isolated world: it can use chrome.runtime messaging but
// the page's own scripts can't see it. All UI lives in a shadow root so the
// host page's CSS never leaks in (or out).
//
// Protocol — background → toast (chrome.tabs.sendMessage):
//   { type: 'ig-toast', state: 'saving' }
//   { type: 'ig-toast', state: 'saved',     data: { id, title } }
//   { type: 'ig-toast', state: 'duplicate', data: { id, title } }
//   { type: 'ig-toast', state: 'signin' }
//   { type: 'ig-toast', state: 'error',     data: { message } }
// Protocol — toast → background (chrome.runtime.sendMessage):
//   { type: 'ig-get-lists' }                          → { ok, lists } | { error }
//   { type: 'ig-create-list', name, bookmarkId }      → { ok, list, url } | { error }
//   { type: 'ig-set-list', listId, bookmarkId, add }  → { ok } | { error }

;(() => {
  // Guard against double-injection: reuse the existing controller if the user
  // clicks again on the same page.
  if (window.__igToast) {
    window.__igToast.reset()
    return
  }

  // Auto-dismiss window. The grey bar loads 0→100% over this, and its
  // animationend is what actually dismisses — so the bar and the timer can never
  // drift, and pausing the bar (on hover/focus) pauses the dismiss for free.
  const DISMISS_MS = 5000

  // Deterministic list-dot palette (hash by name), matching the handoff.
  const DOT_PALETTE = ['#e8551f', '#3b7a57', '#4a6fa5', '#9a6bb0', '#c9a227']
  const dotFor = (name) => {
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
    return DOT_PALETTE[h % DOT_PALETTE.length]
  }

  // Self-hosted brand serif (declared in manifest web_accessible_resources).
  // Substituted for the handoff's Newsreader to keep the extension buildless.
  const FONT_CARDO = chrome.runtime.getURL('fonts/Cardo-Regular.woff2')
  const FONT_CARDO_BOLD = chrome.runtime.getURL('fonts/Cardo-Bold.woff2')

  const host = document.createElement('div')
  host.id = 'internet-gems-toast-host'
  // `all:initial` MUST come first — it resets every property, so the positioning
  // after it survives. Put it last and it wipes out position:fixed.
  host.style.cssText =
    'all:initial;position:fixed;top:16px;right:16px;z-index:2147483647;'
  const root = host.attachShadow({ mode: 'open' })

  root.innerHTML = `
    <style>
      @font-face { font-family:'Cardo'; src:url('${FONT_CARDO}') format('woff2'); font-weight:400; font-display:swap; }
      @font-face { font-family:'Cardo'; src:url('${FONT_CARDO_BOLD}') format('woff2'); font-weight:700; font-display:swap; }
      :host { all: initial; }
      * { box-sizing: border-box; }

      @keyframes toastIn { from { opacity:0; transform:translateY(12px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
      @keyframes fieldDrop { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
      @keyframes barLoad { from { width:0%; } to { width:100%; } }
      @keyframes spin { to { transform: rotate(360deg); } }

      .wrap {
        width: 420px; display: flex; flex-direction: column; gap: 10px;
        font-family: 'Cardo', Georgia, 'Times New Roman', serif;
      }

      .card { background:#fff; border-radius:16px; overflow:hidden; }
      .conf {
        position: relative;
        box-shadow: 0 24px 60px rgba(0,0,0,0.28);
        animation: toastIn 420ms cubic-bezier(0.2,0.8,0.2,1) both;
      }
      .field {
        box-shadow: 0 24px 60px rgba(0,0,0,0.14);
        animation: fieldDrop 420ms 120ms cubic-bezier(0.2,0.8,0.2,1) both;
      }
      .field[hidden] { display: none; }

      /* Auto-dismiss bar — a quiet grey line that loads left→right along the
         BOTTOM edge of the card (Granola-style), not a coloured top bar. */
      .bar {
        position: absolute; left: 0; bottom: 0;
        height: 3px; width: 0; background: #cbc9c3;
      }
      .bar[hidden] { display: none; }
      .bar.run { animation: barLoad var(--dismiss) linear both; }

      .conf-row { display:flex; align-items:center; gap:18px; padding:26px 28px 28px; }
      .icon { flex:none; width:44px; height:44px; display:flex; align-items:center; justify-content:center; }
      .icon .circle { width:44px; height:44px; border-radius:50%; background:#ececeb; display:flex; align-items:center; justify-content:center; }
      .icon .pip { width:16px; height:16px; border-radius:50%; background:#b6b6b4; }
      .icon .spin { width:22px; height:22px; border-radius:50%; border:2px solid #ececeb; border-top-color:#b6b6b4; animation:spin .7s linear infinite; }
      .icon .warn { font-size:26px; line-height:1; color:#e8551f; }
      .icon:empty { display:none; }

      .conf-title { font-size:30px; font-weight:400; color:#1c1c1e; letter-spacing:-0.01em; line-height:1.15; }
      .conf-sub { font-family:system-ui,-apple-system,sans-serif; font-size:14px; color:#9aa0a8; padding:0 28px 24px; margin-top:-14px; line-height:1.4; }
      .conf-sub[hidden] { display:none; }

      /* ── list combobox ── */
      .field-row { padding:18px 24px; display:flex; align-items:center; gap:14px; cursor:text; }
      .field-input {
        flex:1; border:none; outline:none; background:transparent;
        font-family:'Cardo', Georgia, serif; font-size:24px; color:#1c1c1e;
        caret-color:#e8551f; min-width:0;
      }
      .field-input::placeholder { color:#9aa0a8; }
      .chev { flex:none; color:#9aa0a8; font-size:20px; line-height:1; cursor:pointer; transition:transform 220ms ease; }
      .chev.open { transform: rotate(180deg); }

      .panel { border-top:1px solid #efefec; max-height:260px; overflow-y:auto; animation:fieldDrop 260ms ease both; }
      .panel[hidden] { display:none; }

      .lrow { display:flex; align-items:center; gap:12px; padding:14px 24px; cursor:pointer;
              font-family:system-ui,-apple-system,sans-serif; font-size:15px; color:#2c2c2e; }
      .lrow:hover { background:#faf8f5; }
      .lrow .ldot { flex:none; width:8px; height:8px; border-radius:50%; }
      .lrow .lname { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .lrow .lcheck { flex:none; color:#e8551f; font-size:15px; }

      .createrow { display:flex; align-items:center; gap:12px; padding:14px 24px; cursor:pointer;
                   font-family:system-ui,-apple-system,sans-serif; font-size:15px; color:#1c1c1e; background:#faf8f5; }
      .createrow:hover { background:#f4efe9; }
      .createrow[hidden] { display:none; }
      .createrow .cplus { flex:none; width:18px; height:18px; display:flex; align-items:center; justify-content:center; color:#e8551f; font-size:18px; line-height:1; }
      .createrow .ctext { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .createrow .ctext b { font-family:'Cardo', Georgia, serif; font-weight:700; }
      .createrow .ckey { flex:none; font-size:11px; letter-spacing:0.08em; color:#9aa0a8; text-transform:uppercase;
                         border:1px solid #e2e2de; border-radius:6px; padding:3px 8px; font-family:system-ui,sans-serif; }

      .emptyrow { padding:16px 24px; font-family:system-ui,-apple-system,sans-serif; font-size:14px; color:#9aa0a8; }
      .emptyrow[hidden] { display:none; }
    </style>
    <div class="wrap" id="wrap" style="opacity:0">
      <div class="card conf" id="conf">
        <div class="bar" id="bar" hidden></div>
        <div class="conf-row">
          <span class="icon" id="icon"></span>
          <div class="conf-title" id="msg">One moment, saving…</div>
        </div>
        <div class="conf-sub" id="sub" hidden></div>
      </div>
      <div class="card field" id="field" hidden>
        <div class="field-row" id="fieldrow">
          <input class="field-input" id="addinput" placeholder="Add to a list" autocomplete="off" spellcheck="false" />
          <span class="chev" id="chev">⌄</span>
        </div>
        <div class="panel" id="panel" hidden>
          <div id="rows"></div>
          <div class="createrow" id="createrow" hidden>
            <span class="cplus">+</span>
            <span class="ctext" id="ctext"></span>
            <span class="ckey">Enter</span>
          </div>
          <div class="emptyrow" id="emptyrow" hidden>No lists yet — type a name and press Enter.</div>
        </div>
      </div>
    </div>
  `

  const el = (id) => root.getElementById(id)
  const wrap = el('wrap')
  const bar = el('bar')
  const addInput = el('addinput')

  // ── state ──────────────────────────────────────────────────────────
  let bookmarkId = null
  let hovering = false
  let inputFocused = false
  let expanded = false
  // Lists: the user's lists [{ id, name, slug }] and which ones this gem is in.
  let lists = []
  let memberOf = new Set()

  document.documentElement.appendChild(host)
  requestAnimationFrame(() => { wrap.style.opacity = '1' })

  // ── auto-dismiss bar ───────────────────────────────────────────────
  // The bar's animationend is the single source of truth for dismissal, so the
  // countdown a user sees is exactly the countdown that fires.
  bar.addEventListener('animationend', () => dismiss())

  function armBar() {
    bar.hidden = false
    bar.classList.remove('run')
    // Force reflow so re-adding .run restarts the animation from 100%.
    void bar.offsetWidth
    bar.classList.add('run')
    updateBarPause()
  }
  function stopBar() {
    bar.classList.remove('run')
    bar.hidden = true
  }
  function updateBarPause() {
    // Pause the countdown (and thus the dismiss) while the pointer is over the
    // card or the user is engaged in the list input.
    bar.style.animationPlayState = hovering || inputFocused ? 'paused' : 'running'
  }
  function dismiss() {
    wrap.style.transition = 'opacity .3s ease, transform .3s ease'
    wrap.style.opacity = '0'
    wrap.style.transform = 'translateY(-6px)'
    setTimeout(() => host.remove(), 320)
    window.__igToast = null
  }

  // Hovering anywhere in the toast pauses the countdown.
  wrap.addEventListener('mouseenter', () => { hovering = true; updateBarPause() })
  wrap.addEventListener('mouseleave', () => { hovering = false; updateBarPause() })

  // ── confirmation card content ──────────────────────────────────────
  function setMsg(msg) { el('msg').textContent = msg }
  function setSub(text) {
    const sub = el('sub')
    if (text) { sub.textContent = text; sub.hidden = false }
    else { sub.hidden = true }
  }
  function setIcon(kind) {
    const icon = el('icon')
    if (kind === 'bullet') icon.innerHTML = '<span class="circle"><span class="pip"></span></span>'
    else if (kind === 'spin') icon.innerHTML = '<span class="spin"></span>'
    else if (kind === 'warn') icon.innerHTML = '<span class="warn">⚠</span>'
    else icon.innerHTML = ''
  }

  // ── list combobox ──────────────────────────────────────────────────
  el('fieldrow').addEventListener('click', (e) => {
    if (e.target === el('chev')) return // chevron handles its own toggle
    addInput.focus()
  })
  el('chev').addEventListener('click', (e) => {
    e.stopPropagation()
    expanded = !expanded
    if (expanded) addInput.focus()
    renderPanel()
  })
  addInput.addEventListener('focus', () => { inputFocused = true; updateBarPause() })
  addInput.addEventListener('blur', () => { inputFocused = false; updateBarPause() })
  addInput.addEventListener('input', () => renderPanel())
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const typed = addInput.value.trim()
      if (!typed) return
      const exact = lists.find((l) => l.name.toLowerCase() === typed.toLowerCase())
      if (exact) { if (!memberOf.has(exact.id)) toggleListMembership(exact); addInput.value = ''; renderPanel() }
      else createListByName(typed)
    } else if (e.key === 'Escape') {
      addInput.value = ''
      expanded = false
      renderPanel()
      addInput.blur()
    }
  })

  function renderPanel() {
    const raw = addInput.value
    const q = raw.trim().toLowerCase()
    el('chev').classList.toggle('open', expanded)

    const showPanel = expanded || raw.length > 0
    el('panel').hidden = !showPanel
    if (!showPanel) return

    const matches = lists.filter((l) => !q || l.name.toLowerCase().includes(q))
    const exactMatch = lists.some((l) => l.name.toLowerCase() === q)
    const showCreate = q.length > 0 && !exactMatch

    // List rows
    const rows = el('rows')
    rows.innerHTML = ''
    for (const l of matches) {
      const row = document.createElement('div')
      row.className = 'lrow'
      row.title = l.name
      const selected = memberOf.has(l.id)
      row.innerHTML =
        `<span class="ldot" style="background:${dotFor(l.name)}"></span>` +
        `<span class="lname"></span>` +
        (selected ? '<span class="lcheck">✓</span>' : '')
      row.querySelector('.lname').textContent = l.name
      row.addEventListener('click', (e) => { e.stopPropagation(); toggleListMembership(l) })
      rows.appendChild(row)
    }

    // Create row
    const createrow = el('createrow')
    createrow.hidden = !showCreate
    if (showCreate) {
      el('ctext').innerHTML = 'Create “<b></b>”'
      el('ctext').querySelector('b').textContent = raw.trim()
    }

    // Empty row (no matches, nothing to create)
    el('emptyrow').hidden = !(matches.length === 0 && !showCreate)
  }

  el('createrow').addEventListener('click', (e) => {
    e.stopPropagation()
    const typed = addInput.value.trim()
    if (typed) createListByName(typed)
  })

  // Optimistically toggle membership, then reconcile with the server.
  function toggleListMembership(l) {
    if (!bookmarkId) return
    const add = !memberOf.has(l.id)
    if (add) memberOf.add(l.id)
    else memberOf.delete(l.id)
    renderPanel()
    chrome.runtime.sendMessage(
      { type: 'ig-set-list', listId: l.id, bookmarkId, add },
      (resp) => {
        if (!resp || resp.error) {
          if (add) memberOf.delete(l.id)
          else memberOf.add(l.id)
          renderPanel()
        }
      },
    )
  }

  // Create + publish a list and file this bullet into it.
  function createListByName(name) {
    if (!name || !bookmarkId) return
    chrome.runtime.sendMessage(
      { type: 'ig-create-list', name, bookmarkId },
      (resp) => {
        if (resp && resp.ok && resp.list) {
          lists.unshift(resp.list)
          memberOf.add(resp.list.id)
          addInput.value = ''
          renderPanel()
          addInput.focus()
        }
      },
    )
  }

  function loadLists() {
    chrome.runtime.sendMessage({ type: 'ig-get-lists' }, (resp) => {
      if (resp && resp.ok && Array.isArray(resp.lists)) {
        lists = resp.lists
        if (!el('panel').hidden) renderPanel()
      }
    })
  }

  // ── saved: reveal the list field + start the countdown ─────────────
  function showSaved(msg, data) {
    setIcon('bullet')
    setMsg(msg)
    setSub('')
    bookmarkId = (data && data.id) || null
    if (bookmarkId) {
      el('field').hidden = false
      memberOf = new Set()
      renderPanel()
    } else {
      el('field').hidden = true
    }
    armBar()
  }

  // ── controller exposed to background messages ──────────────────────
  function reset() {
    stopBar()
    bookmarkId = null
    expanded = false
    lists = []
    memberOf = new Set()
    addInput.value = ''
    el('field').hidden = true
    el('panel').hidden = true
    setSub('')
    setIcon('spin')
    setMsg('One moment, saving…')
    // Prefetch lists in parallel with the save round-trip so the panel is ready
    // the instant the bullet lands.
    loadLists()
  }

  window.__igToast = {
    reset,
    apply(state, data) {
      if (state === 'saving') {
        reset()
      } else if (state === 'saved') {
        showSaved('Saved to your Bulletin', data)
      } else if (state === 'duplicate') {
        showSaved('Already in your Bulletin', data)
      } else if (state === 'signin') {
        // Session expired mid-save — invite a re-sign-in, not the raw auth error.
        setIcon('warn')
        setMsg('Session expired — sign in to save')
        setSub('Click the Bulletin icon to sign in again.')
        el('field').hidden = true
        armBar()
      } else if (state === 'error') {
        setIcon('warn')
        setMsg('Couldn’t save')
        setSub((data && data.message) || 'Something went wrong — try again.')
        el('field').hidden = true
        armBar()
      }
    },
  }

  // First injection in a tab doesn't go through reset(): start in the saving
  // state and kick off the list prefetch so it overlaps the in-flight save.
  setIcon('spin')
  loadLists()

  chrome.runtime.onMessage.addListener((m) => {
    if (m && m.type === 'ig-toast' && window.__igToast) {
      window.__igToast.apply(m.state, m.data)
    }
  })
})()
