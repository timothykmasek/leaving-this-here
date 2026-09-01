// On-page save card — injected into the active tab by the background worker.
// The WHOLE save experience lives here now, mymind-style (Tim, 2026-09-01):
// clicking the toolbar icon saves immediately and this floating rounded card
// top-right is what you watch, not a popup.
//
// Three states, one-frame transitions between them:
//   1. Saving — a compact grey bar: "Saving to Bulletin" + a breathing dot.
//   2. Saved  — revealed ONLY once the save AND the ranked lists are both in
//      hand, in one motion: title flips, the dot dissolves into the
//      public/secret pill, the status line fades in, and the list picker
//      (dot-grid ground, ≤3 rows visible, Create List hugging beneath)
//      expands below. No intermediate "saved but empty" beat.
//   3. Create List — slides in from the right at the same height: name field,
//      "Make this list secret" toggle, the app's rounded-lg CTA.
//
// Dismissal: an idle timer after the reveal (paused while hovering or typing,
// restarted by filing), Escape, or clicking anywhere outside the card.
//
// Injected via chrome.scripting.executeScript({ files: [...] }) so it runs as
// a content script in the isolated world. All UI lives in a shadow root so the
// host page's CSS never leaks in (or out).
//
// Protocol — background → card (chrome.tabs.sendMessage):
//   { type: 'ig-toast', state: 'saving' }
//   { type: 'ig-toast', state: 'saved',     data: { id, title, refreshed } }
//   { type: 'ig-toast', state: 'duplicate', data: { id, title } }
//   { type: 'ig-toast', state: 'signin' }
//   { type: 'ig-toast', state: 'error',     data: { message } }
// Protocol — card → background (chrome.runtime.sendMessage):
//   { type: 'ig-get-lists', bookmarkId }                   → { ok, lists, memberOf }
//   { type: 'ig-create-list', name, bookmarkId, isPrivate } → { ok, list, url }
//   { type: 'ig-set-list', listId, bookmarkId, add }        → { ok }
//   { type: 'ig-set-visibility', bookmarkId, isPrivate }    → { ok }

;(() => {
  if (window.__igToast) {
    window.__igToast.reset()
    return
  }

  // Idle window before the card dismisses itself once revealed. Hover/typing
  // pause it; filing restarts it.
  const DISMISS_MS = 8000
  // Backstop only: never sit on "Saving…" forever if the list fetch stalls.
  const REVEAL_TIMEOUT_MS = 8000

  // Brand fonts, same cuts as the web app (declared in web_accessible_resources).
  const FONT_BOOK = chrome.runtime.getURL('fonts/MierA-Book.woff2')
  const FONT_REGULAR = chrome.runtime.getURL('fonts/MierA-Regular.woff2')

  const host = document.createElement('div')
  host.id = 'internet-gems-toast-host'
  // `all:initial` MUST come first — it resets every property, so the
  // positioning after it survives.
  host.style.cssText =
    'all:initial;position:fixed;top:26px;right:26px;z-index:2147483647;'
  const root = host.attachShadow({ mode: 'open' })

  root.innerHTML = `
    <style>
      @font-face { font-family:'Mier A'; src:url('${FONT_BOOK}') format('woff2'); font-weight:400; font-display:swap; }
      @font-face { font-family:'Mier A'; src:url('${FONT_REGULAR}') format('woff2'); font-weight:500; font-display:swap; }
      :host { all: initial; }
      * { box-sizing: border-box; }
      ::selection { background: #e4e2de; }

      @keyframes cardIn { from { opacity:0; transform:translateY(8px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
      @keyframes breathe {
        0%, 100% { transform: scale(1); opacity: 0.55; }
        50%      { transform: scale(1.3); opacity: 1; }
      }

      .card {
        width: 340px;
        font-family: 'Mier A', system-ui, sans-serif;
        background: #fff;
        border-radius: 20px;
        box-shadow: 0 12px 30px rgba(20,18,14,0.22);
        overflow: hidden;
        animation: cardIn 300ms cubic-bezier(0.2,0.8,0.2,1) both;
      }
      .screens { position: relative; overflow: hidden; }
      .screen-main {
        display: flex; flex-direction: column; min-height: 0;
        transition: transform 300ms cubic-bezier(0.2,0.8,0.2,1),
                    min-height 300ms cubic-bezier(0.2,0.8,0.2,1);
      }
      .screens.show-create .screen-main { transform: translateX(-18%); min-height: 320px; }
      .screen-create {
        position: absolute; inset: 0;
        display: flex; flex-direction: column;
        background: #fff;
        transform: translateX(100%);
        transition: transform 300ms cubic-bezier(0.2,0.8,0.2,1);
        visibility: hidden;
      }
      .screens.show-create .screen-create { transform: translateX(0); visibility: visible; }

      /* ── header band ── */
      .phead { flex: none; background: #f0f0f0; padding: 20px 22px 18px; }
      .phead-top { display: flex; align-items: center; justify-content: space-between; min-height: 25px; }
      .ptitle { margin: 0; font-weight: 400; font-size: 18px; line-height: 24px; color: #000; }

      /* Top-right slot: breathing dot while saving → the pill once saved. */
      .hslot { position: relative; flex: none; width: 50px; height: 25px; }
      .hslot.off { visibility: hidden; }
      .breath {
        position: absolute; top: 4px; right: 0;
        width: 17px; height: 17px; border-radius: 50%;
        background: #d9d9d9;
        animation: breathe 1.5s ease-in-out infinite;
        transition: opacity 200ms ease;
      }
      .revealed .breath { opacity: 0; animation-play-state: paused; }

      .vis {
        position: absolute; inset: 0;
        display: flex; align-items: center;
        padding: 2px; border: none; border-radius: 30px;
        background: #e2e2e2; cursor: pointer;
        opacity: 0; transform: scale(0.4); transform-origin: right center;
        pointer-events: none;
        transition: opacity 240ms ease, transform 280ms cubic-bezier(0.2,0.8,0.2,1);
      }
      .revealed .vis { opacity: 1; transform: scale(1); pointer-events: auto; }
      .vis-thumb {
        position: absolute; top: 2px; left: 2px;
        width: 21px; height: 21px; border-radius: 50%;
        background: #000;
        transition: transform 220ms cubic-bezier(0.3,0.7,0.3,1.05);
      }
      .vis[aria-checked="true"] .vis-thumb { transform: translateX(25px); }
      .vis-side {
        position: relative; z-index: 1; flex: 1;
        display: flex; align-items: center; justify-content: center;
        height: 21px; color: #8a8a8a;
        transition: color 200ms ease;
      }
      .vis-side svg { width: 13px; height: 13px; }
      .vis[aria-checked="false"] .vis-side[data-side="public"],
      .vis[aria-checked="true"] .vis-side[data-side="secret"] { color: #fff; }

      /* Status line — folded away while saving, revealed with everything else. */
      .pstatus {
        display: flex; align-items: center; gap: 7px;
        font-size: 12px; line-height: 16px; letter-spacing: 0.05em; color: #000;
        max-height: 0; margin-top: 0; opacity: 0; transform: translateY(-3px);
        overflow: hidden;
        transition: opacity 260ms ease 80ms, transform 260ms ease 80ms,
                    max-height 260ms ease, margin-top 260ms ease;
      }
      .pstatus.shown { max-height: 16px; margin-top: 13px; opacity: 1; transform: translateY(0); }
      .pstatus.err .sword { font-weight: 500; }
      .scheck { display: flex; color: #000; }
      .scheck[hidden] { display: none; }
      .scheck svg { width: 10px; height: 10px; }
      .snote { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      /* ── body: dot-grid ground, label + rows (≤3 visible) + create ── */
      .pbody {
        display: flex; flex-direction: column; min-height: 0;
        background-image: radial-gradient(circle, #d9d9d9 1px, transparent 1px);
        background-size: 32px 32px; background-position: 0 0;
        max-height: 0; opacity: 0; overflow: hidden;
        transition: max-height 360ms cubic-bezier(0.2,0.8,0.2,1), opacity 280ms ease 60ms;
      }
      .pbody.open { max-height: var(--body-h, 420px); opacity: 1; }
      .slabel {
        flex: none; padding: 16px 22px 10px;
        font-size: 12px; line-height: 16px; letter-spacing: 0.05em; color: #000;
      }
      .rows { flex: none; max-height: 168px; overflow-y: auto; }
      .rows::-webkit-scrollbar { width: 7px; }
      .rows::-webkit-scrollbar-thumb {
        background: #000; background-clip: padding-box;
        border-left: 5px solid transparent; border-radius: 30px;
      }
      .lrow {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 0 22px; height: 56px;
        border-bottom: 1px solid #f0f0f0; cursor: pointer;
      }
      .lrow:hover { background: rgba(0,0,0,0.02); }
      .lname {
        font-weight: 400; font-size: 15px; line-height: 22px; letter-spacing: 0.05em;
        color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .dot {
        flex: none; width: 17px; height: 17px; padding: 0;
        border: none; border-radius: 50%; background: #d9d9d9;
        display: flex; align-items: center; justify-content: center; cursor: pointer;
      }
      .dot::after {
        content: ''; width: 9px; height: 9px; border-radius: 50%; background: #000;
        transform: scale(0);
        transition: transform 140ms cubic-bezier(0.3,0.7,0.3,1.2);
      }
      .lrow.on .dot::after, .dot[aria-checked="true"]::after { transform: scale(1); }
      .rows-empty { padding: 4px 22px 0; font-size: 12px; letter-spacing: 0.05em; color: #8a8a8a; }

      .create-open {
        flex: none; padding: 16px 22px 20px;
        border: none; background: none; text-align: left;
        font-family: inherit; font-weight: 400; font-size: 15px; line-height: 22px;
        letter-spacing: 0.05em; color: #000; cursor: pointer;
      }
      .create-open:hover { text-decoration: underline; text-underline-offset: 3px; }

      /* ── screen 2: create list ── */
      .phead-sm { padding: 20px 22px 18px; }
      .back {
        display: flex; align-items: center; gap: 10px;
        padding: 0; border: none; background: none; cursor: pointer;
        color: #000; font-family: inherit;
      }
      .back svg { width: 18px; height: 18px; }
      .back .ptitle { font-size: 18px; }
      .cbody {
        flex: 1; display: flex; flex-direction: column; min-height: 0;
        padding: 20px 22px 22px;
        background-image: radial-gradient(circle, #d9d9d9 1px, transparent 1px);
        background-size: 32px 32px; background-position: 0 0;
      }
      .cfield {
        flex: none; width: 100%; height: 46px; padding: 13px;
        border: 1px solid #e0e0e0; border-radius: 9px; background: #fff;
        font-family: inherit; font-weight: 400; font-size: 14px; line-height: 20px;
        letter-spacing: 0.05em; color: #000; outline: none;
      }
      .cfield::placeholder { color: #9a9a9a; }
      .cfield:focus { border-color: #000; }
      .cspacer { flex: 1; min-height: 20px; }
      .secret-row {
        flex: none; display: flex; align-items: flex-start; justify-content: space-between;
        gap: 12px; margin-bottom: 18px;
      }
      .secret-title { font-weight: 400; font-size: 15px; line-height: 22px; letter-spacing: 0.05em; color: #000; }
      .secret-sub { margin-top: 2px; font-size: 12px; line-height: 16px; letter-spacing: 0.05em; color: #000; }
      .secret-row .dot { margin-top: 3px; }
      /* The app's CTA (design verdicts: rounded-lg, sentence case, gray-900). */
      .cta {
        flex: none; width: 100%; height: 40px;
        border: none; border-radius: 8px; background: #111827;
        font-family: inherit; font-weight: 500; font-size: 14px; line-height: 20px;
        color: #fff; cursor: pointer;
        transition: background 150ms ease;
      }
      .cta:hover { background: #1f2937; }
      .cta:disabled { opacity: 0.5; cursor: default; }
    </style>

    <div class="card" id="card">
      <div class="screens" id="screens">
        <div class="screen-main" id="screen-main">
          <header class="phead">
            <div class="phead-top">
              <h1 class="ptitle" id="ptitle">Saving to Bulletin</h1>
              <div class="hslot" id="hslot">
                <span class="breath"></span>
                <button id="vis" class="vis" role="switch" aria-checked="false"
                        aria-label="Make this save secret">
                  <span class="vis-thumb"></span>
                  <span class="vis-side" data-side="public">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="9"/>
                      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>
                    </svg>
                  </span>
                  <span class="vis-side" data-side="secret">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="5" y="11" width="14" height="9" rx="2"/>
                      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
                    </svg>
                  </span>
                </button>
              </div>
            </div>
            <div class="pstatus" id="pstatus">
              <span class="sword" id="sword">Saved</span>
              <span class="scheck" id="scheck">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
                     stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              </span>
              <span class="snote" id="snote"></span>
            </div>
          </header>

          <div class="pbody" id="pbody">
            <div class="slabel">Save to list</div>
            <div class="rows" id="rows"></div>
            <button class="create-open" id="btn-create">Create List</button>
          </div>
        </div>

        <div class="screen-create" id="screen-create">
          <header class="phead phead-sm">
            <button class="back" id="btn-back" aria-label="Back">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
                   stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>
              <span class="ptitle">Create List</span>
            </button>
          </header>
          <div class="cbody">
            <input class="cfield" id="new-name" placeholder="List name"
                   autocomplete="off" spellcheck="false" maxlength="80" />
            <div class="cspacer"></div>
            <div class="secret-row">
              <div>
                <div class="secret-title">Make this list secret</div>
                <div class="secret-sub">Only you can see this list</div>
              </div>
              <button class="dot" id="secret-toggle" role="switch" aria-checked="false"
                      aria-label="Make this list secret"></button>
            </div>
            <button class="cta" id="btn-do-create">Create</button>
          </div>
        </div>
      </div>
    </div>
  `

  const el = (id) => root.getElementById(id)
  const card = el('card')
  const screens = el('screens')
  const nameInput = el('new-name')

  const COPY = {
    public: 'Anyone with your page can see this link',
    secret: 'Only you can see this link',
  }

  // ── state ──────────────────────────────────────────────────────────
  let bookmarkId = null
  let isSecret = false
  let lists = []
  let memberOf = new Set()
  let creating = false
  let revealed = false
  let revealTimer = null
  let revealMsg = 'Saved'
  // A later save superseding this one: stamp every async response.
  let saveSeq = 0

  // ── dismissal ──────────────────────────────────────────────────────
  let idleTimer = null
  let hovering = false
  let typing = false
  function armIdle(ms = DISMISS_MS) {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (!hovering && !typing && !screens.classList.contains('show-create')) dismiss()
      else armIdle() // still busy — check again in a while
    }, ms)
  }
  function dismiss() {
    clearTimeout(idleTimer)
    clearTimeout(revealTimer)
    card.style.transition = 'opacity .3s ease, transform .3s ease'
    card.style.opacity = '0'
    card.style.transform = 'translateY(-6px)'
    setTimeout(() => host.remove(), 320)
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('keydown', onKey, true)
    window.__igToast = null
  }
  card.addEventListener('mouseenter', () => { hovering = true })
  card.addEventListener('mouseleave', () => { hovering = false })
  // Click anywhere outside the card closes it (mymind behavior). The card
  // itself is the only thing inside our host.
  function onOutside(e) {
    if (e.composedPath().includes(host)) return
    dismiss()
  }
  function onKey(e) {
    if (e.key === 'Escape') dismiss()
  }
  document.addEventListener('pointerdown', onOutside, true)
  document.addEventListener('keydown', onKey, true)

  document.documentElement.appendChild(host)

  // ── header stages ──────────────────────────────────────────────────
  function setStatus(word, note, { check = true, err = false } = {}) {
    el('sword').textContent = word
    el('snote').textContent = note
    el('scheck').hidden = !check
    const s = el('pstatus')
    s.classList.toggle('err', err)
    s.classList.add('shown')
  }

  // ── visibility toggle ──────────────────────────────────────────────
  el('vis').addEventListener('click', () => {
    if (!bookmarkId) return
    isSecret = !isSecret
    renderVisibility()
    armIdle()
    chrome.runtime.sendMessage(
      { type: 'ig-set-visibility', bookmarkId, isPrivate: isSecret },
      (resp) => {
        if (!resp || resp.error) {
          isSecret = !isSecret
          renderVisibility()
        }
      }
    )
  })
  function renderVisibility() {
    el('vis').setAttribute('aria-checked', String(isSecret))
    setStatus(revealMsg, COPY[isSecret ? 'secret' : 'public'])
  }

  // ── list rows + body ───────────────────────────────────────────────
  function renderRows() {
    const rows = el('rows')
    rows.innerHTML = ''
    if (!lists.length) {
      const p = document.createElement('div')
      p.className = 'rows-empty'
      p.textContent = 'No lists yet — create your first below.'
      rows.appendChild(p)
    }
    for (const l of lists) {
      const r = document.createElement('div')
      r.className = 'lrow' + (memberOf.has(l.id) ? ' on' : '')
      r.title = l.name
      r.innerHTML = '<span class="lname"></span><span class="dot"></span>'
      r.querySelector('.lname').textContent = l.name
      r.addEventListener('click', () => toggleMembership(l, r))
      rows.appendChild(r)
    }
    syncBodyHeight()
  }
  function syncBodyHeight() {
    const body = el('pbody')
    body.style.setProperty('--body-h', `${body.scrollHeight}px`)
  }
  function toggleMembership(l, rowEl) {
    if (!bookmarkId) return
    const add = !memberOf.has(l.id)
    if (add) memberOf.add(l.id)
    else memberOf.delete(l.id)
    rowEl.classList.toggle('on', add)
    armIdle() // still working
    chrome.runtime.sendMessage(
      { type: 'ig-set-list', listId: l.id, bookmarkId, add },
      (resp) => {
        if (!resp || resp.error) {
          if (add) memberOf.delete(l.id)
          else memberOf.add(l.id)
          rowEl.classList.toggle('on', !add)
        }
      }
    )
  }

  // ── screens ────────────────────────────────────────────────────────
  el('btn-create').addEventListener('click', () => {
    nameInput.value = ''
    el('secret-toggle').setAttribute('aria-checked', 'false')
    el('btn-do-create').disabled = false
    el('btn-do-create').textContent = 'Create'
    screens.classList.add('show-create')
    setTimeout(() => nameInput.focus({ preventScroll: true }), 310)
  })
  el('btn-back').addEventListener('click', () => {
    screens.classList.remove('show-create')
    armIdle()
  })
  el('secret-toggle').addEventListener('click', () => {
    const t = el('secret-toggle')
    t.setAttribute('aria-checked', String(t.getAttribute('aria-checked') !== 'true'))
  })
  nameInput.addEventListener('focus', () => { typing = true })
  nameInput.addEventListener('blur', () => { typing = false })
  nameInput.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter') {
      e.preventDefault()
      commitCreate()
    } else if (e.key === 'Escape') {
      // Escape in the field backs out of screen 2, not out of the card —
      // stop it before the document-level close handler sees it.
      e.preventDefault()
      e.stopPropagation()
      screens.classList.remove('show-create')
      armIdle()
    }
  })
  el('btn-do-create').addEventListener('click', commitCreate)

  function commitCreate() {
    const name = nameInput.value.trim()
    if (!name || creating || !bookmarkId) return
    const secret = el('secret-toggle').getAttribute('aria-checked') === 'true'

    // Typing the name of a list they already have files into it rather than
    // minting a near-duplicate (the server dedupes too).
    const exact = lists.find((l) => l.name.toLowerCase() === name.toLowerCase())
    if (exact) {
      if (!memberOf.has(exact.id)) {
        memberOf.add(exact.id)
        chrome.runtime.sendMessage(
          { type: 'ig-set-list', listId: exact.id, bookmarkId, add: true },
          (resp) => { if (!resp || resp.error) { memberOf.delete(exact.id); renderRows() } }
        )
      }
      renderRows()
      screens.classList.remove('show-create')
      armIdle()
      return
    }

    creating = true
    const btn = el('btn-do-create')
    btn.disabled = true
    btn.textContent = 'Creating…'
    chrome.runtime.sendMessage(
      { type: 'ig-create-list', name, bookmarkId, isPrivate: secret },
      (resp) => {
        creating = false
        if (resp && resp.ok && resp.list) {
          lists = [resp.list, ...lists.filter((l) => l.id !== resp.list.id)]
          memberOf.add(resp.list.id)
          renderRows()
          screens.classList.remove('show-create')
          armIdle()
        } else {
          btn.disabled = false
          btn.textContent = 'Create'
          nameInput.focus()
        }
      }
    )
  }

  // ── the one-frame reveal ───────────────────────────────────────────
  // Saving → (save lands, ranked lists fetched) → everything at once.
  function reveal() {
    if (revealed) return
    revealed = true
    clearTimeout(revealTimer)
    el('ptitle').textContent = 'Save to Bulletin'
    card.classList.add('revealed')
    renderVisibility() // status line: "Saved ✓ …"
    renderRows()
    el('pbody').classList.add('open')
    armIdle()
  }

  function showSaved(msg, data) {
    revealMsg = msg
    bookmarkId = (data && data.id) || null
    isSecret = false
    const seq = ++saveSeq
    if (!bookmarkId) return terminal(msg, '')
    // Hold "Saving…" until the ranked lists are in hand, then reveal once.
    clearTimeout(revealTimer)
    revealTimer = setTimeout(reveal, REVEAL_TIMEOUT_MS)
    chrome.runtime.sendMessage({ type: 'ig-get-lists', bookmarkId }, (resp) => {
      if (seq !== saveSeq) return // a newer save superseded this one
      if (resp && resp.ok && Array.isArray(resp.lists)) {
        lists = resp.lists
        memberOf = new Set(resp.memberOf || [])
      }
      reveal()
    })
  }

  // Terminal without the picker (duplicate / error / signin): title flips,
  // dot stops, message in the status line, quiet dismiss.
  function terminal(word, note, { err = false } = {}) {
    el('ptitle').textContent = 'Save to Bulletin'
    el('hslot').classList.add('off')
    setStatus(word, note, { check: !err, err })
    armIdle(6000)
  }

  // ── controller ─────────────────────────────────────────────────────
  function reset() {
    ++saveSeq
    clearTimeout(revealTimer)
    clearTimeout(idleTimer)
    bookmarkId = null
    isSecret = false
    lists = []
    memberOf = new Set()
    creating = false
    revealed = false
    card.classList.remove('revealed')
    el('hslot').classList.remove('off')
    el('pstatus').classList.remove('shown', 'err')
    el('pbody').classList.remove('open')
    screens.classList.remove('show-create')
    el('ptitle').textContent = 'Saving to Bulletin'
    el('vis').setAttribute('aria-checked', 'false')
    nameInput.value = ''
  }

  window.__igToast = {
    reset,
    apply(state, data) {
      if (state === 'saving') {
        reset()
      } else if (state === 'saved') {
        showSaved(data && data.refreshed ? 'Updated' : 'Saved', data)
      } else if (state === 'duplicate') {
        showSaved('Already in your Bulletin', data)
      } else if (state === 'signin') {
        terminal('Session expired', 'Click the Bulletin icon to sign in again.', { err: true })
      } else if (state === 'error') {
        terminal('Couldn’t save', (data && data.message) || 'Something went wrong — try again.', { err: true })
      }
    },
  }

  chrome.runtime.onMessage.addListener((m) => {
    if (m && m.type === 'ig-toast' && window.__igToast) {
      window.__igToast.apply(m.state, m.data)
    }
  })
})()
