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
      .phead { flex: none; background: #f6f6f6; padding: 20px 22px 18px; }
      .phead-top { display: flex; align-items: center; justify-content: space-between; min-height: 25px; }
      .ptitle { margin: 0; font-weight: 500; font-size: 18px; line-height: 24px; color: #000; }
      .ptitle a {
        display: inline-flex; align-items: center; gap: 5px;
        color: #000; text-decoration: none;
      }
      .ptitle a:hover { text-decoration: underline; text-underline-offset: 3px; }
      .ptitle a svg { width: 15px; height: 15px; flex: none; }
      /* Undo — quiet text at the right end of the status line, only there
         once the save landed. Speaks the card's hover language: underline. */
      .undo {
        flex: none; margin-left: auto; padding: 0;
        border: none; background: none;
        font-family: inherit; font-size: 12px; line-height: 16px;
        letter-spacing: 0.05em; color: #8a8a8a; cursor: pointer;
        opacity: 0; pointer-events: none;
        transition: opacity 240ms ease, color 150ms ease;
      }
      .revealed .undo { opacity: 1; pointer-events: auto; }
      .undo:hover { color: #000; text-decoration: underline; text-underline-offset: 2px; }
      .undo:disabled { opacity: 0.35; pointer-events: none; }

      /* Top-right slot: breathing dot while saving → the pill once saved. */
      .hslot { position: relative; flex: none; width: 50px; height: 25px; }
      .hslot.off { visibility: hidden; }
      .breath {
        position: absolute; top: 4px; right: 0;
        width: 17px; height: 17px; border-radius: 50%;
        background: #e4e4e4;
        animation: breathe 1.5s ease-in-out infinite;
        transition: opacity 200ms ease;
      }
      .revealed .breath { opacity: 0; animation-play-state: paused; }

      /* space-between + fixed 21px sides: each icon's center lands exactly on
         the 21px thumb's center at both ends of its travel (flex halves were
         23px wide, parking the globe ~1px off the black circle). */
      .vis {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: space-between;
        padding: 2px; border: none; border-radius: 30px;
        background: #ececec; cursor: pointer;
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
        position: relative; z-index: 1; flex: none; width: 21px;
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
      /* The tick sits in a soft green chip. */
      .scheck {
        display: flex; align-items: center; justify-content: center;
        width: 16px; height: 16px; border-radius: 50%;
        background: #ddf2e3; color: #1a7f37;
      }
      .scheck[hidden] { display: none; }
      .scheck svg { width: 9px; height: 9px; }
      .snote { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      /* ── body: dot-grid ground, label + rows (≤3 visible) + create ── */
      .pbody {
        display: flex; flex-direction: column; min-height: 0;
        background-image: radial-gradient(circle, #e4e4e4 1px, transparent 1px);
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
        border-bottom: 1px solid #f4f4f4; cursor: pointer;
      }
      /* Hover speaks in underline, not a grey wash (Tim, 2026-09-04). */
      .lrow:hover .lname { text-decoration: underline; text-underline-offset: 3px; }
      .lname {
        font-weight: 500; font-size: 15px; line-height: 22px; letter-spacing: 0.05em;
        color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .dot {
        flex: none; width: 17px; height: 17px; padding: 0;
        border: none; border-radius: 50%; background: #e4e4e4;
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
        background-image: radial-gradient(circle, #e4e4e4 1px, transparent 1px);
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
      /* Quiet by design — an option you can find, not a decision the screen
         pushes (Tim: soft grey, smaller). */
      .secret-title { font-weight: 400; font-size: 13px; line-height: 18px; letter-spacing: 0.05em; color: #8a8a8a; }
      .secret-sub { margin-top: 1px; font-size: 11px; line-height: 15px; letter-spacing: 0.05em; color: #a8a8a8; }
      .secret-row .dot { margin-top: 1px; }
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
              <h1 class="ptitle" id="ptitle">Saving to your Bulletin</h1>
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
              <button class="undo" id="undo" aria-label="Undo this save">Undo</button>
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
    public: 'Visible on your page',
    secret: 'Only you can see this',
  }

  // ── state ──────────────────────────────────────────────────────────
  let bookmarkId = null
  let profileUrl = null
  let isSecret = false
  // Optimistic reveal: the card shows "Saved ✓" the moment it opens, while the
  // real save is still in flight. Anything the user does before the bookmark id
  // arrives (file into a list, flip secret, undo) queues here and flushes the
  // moment the confirm lands. The user never feels the gap.
  let pending = []
  let userToggledVis = false
  let undone = false
  function withId(fn) {
    if (bookmarkId) fn(bookmarkId)
    else pending.push(fn)
  }
  function flushPending(id) {
    const q = pending
    pending = []
    for (const fn of q) fn(id)
  }
  let lists = []
  let memberOf = new Set()
  let creating = false
  let revealed = false
  let revealTimer = null
  let revealMsg = 'Saved'
  // A later save superseding this one: stamp every async response.
  let saveSeq = 0
  // Lists are prefetched the moment the card injects, in PARALLEL with the
  // save (they don't depend on it — no ranking, no membership for a fresh
  // save), so the reveal is gated on the save alone in the common case.
  // null = still in flight; a function = the reveal waiting on it.
  let prefetched = null
  let onPrefetch = null
  function prefetchLists() {
    prefetched = null
    chrome.runtime.sendMessage({ type: 'ig-get-lists' }, (resp) => {
      prefetched = (resp && resp.ok && Array.isArray(resp.lists)) ? resp.lists : []
      if (onPrefetch) { const f = onPrefetch; onPrefetch = null; f() }
    })
  }

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
  // Once saved, the title is a live link to the user's page (underline on
  // hover + a small ↗) — or plain text if the save response had no username.
  function setTitleSaved() {
    const t = el('ptitle')
    if (profileUrl) {
      t.innerHTML = ''
      const a = document.createElement('a')
      a.href = profileUrl
      a.target = '_blank'
      a.rel = 'noopener'
      a.textContent = 'Saved to your Bulletin'
      a.insertAdjacentHTML(
        'beforeend',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg>'
      )
      t.appendChild(a)
    } else {
      t.textContent = 'Saved to your Bulletin'
    }
  }

  function setStatus(word, note, { check = true, err = false } = {}) {
    el('sword').textContent = word
    el('snote').textContent = note
    el('scheck').hidden = !check
    const s = el('pstatus')
    s.classList.toggle('err', err)
    s.classList.add('shown')
  }

  // ── undo ───────────────────────────────────────────────────────────
  // Deletes the bullet outright and folds the card down to a quiet "Removed".
  el('undo').addEventListener('click', () => {
    const btn = el('undo')
    if (btn.disabled) return
    btn.disabled = true
    undone = true
    // Fold the card down right away — the delete itself rides the queue, so an
    // undo clicked before the save even confirmed still lands (create → delete).
    card.classList.remove('revealed')
    el('hslot').classList.add('off')
    el('pbody').classList.remove('open')
    el('ptitle').textContent = 'Save to your Bulletin'
    setStatus('Removed', 'This link is off your page', { check: false })
    armIdle(2500)
    withId((id) => {
      bookmarkId = null
      chrome.runtime.sendMessage({ type: 'ig-delete-bullet', bookmarkId: id }, (resp) => {
        if (!resp || resp.error) {
          setStatus('Couldn’t undo', 'It’s still on your page', { check: false, err: true })
          armIdle(4000)
        }
      })
    })
  })

  // ── visibility toggle ──────────────────────────────────────────────
  el('vis').addEventListener('click', () => {
    isSecret = !isSecret
    userToggledVis = true
    renderVisibility()
    armIdle()
    const want = isSecret
    withId((id) =>
      chrome.runtime.sendMessage(
        { type: 'ig-set-visibility', bookmarkId: id, isPrivate: want },
        (resp) => {
          if (!resp || resp.error) {
            isSecret = !want
            renderVisibility()
          }
        }
      )
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
    const add = !memberOf.has(l.id)
    if (add) memberOf.add(l.id)
    else memberOf.delete(l.id)
    rowEl.classList.toggle('on', add)
    armIdle() // still working
    withId((id) =>
      chrome.runtime.sendMessage(
        { type: 'ig-set-list', listId: l.id, bookmarkId: id, add },
        (resp) => {
          if (!resp || resp.error) {
            if (add) memberOf.delete(l.id)
            else memberOf.add(l.id)
            rowEl.classList.toggle('on', !add)
          }
        }
      )
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
    if (!name || creating) return
    const secret = el('secret-toggle').getAttribute('aria-checked') === 'true'

    // Typing the name of a list they already have files into it rather than
    // minting a near-duplicate (the server dedupes too).
    const exact = lists.find((l) => l.name.toLowerCase() === name.toLowerCase())
    if (exact) {
      if (!memberOf.has(exact.id)) {
        memberOf.add(exact.id)
        withId((id) =>
          chrome.runtime.sendMessage(
            { type: 'ig-set-list', listId: exact.id, bookmarkId: id, add: true },
            (resp) => { if (!resp || resp.error) { memberOf.delete(exact.id); renderRows() } }
          )
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
    withId((id) =>
      chrome.runtime.sendMessage(
        { type: 'ig-create-list', name, bookmarkId: id, isPrivate: secret },
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
    )
  }

  // ── the one-frame reveal ───────────────────────────────────────────
  // Saving → (save lands, ranked lists fetched) → everything at once.
  function reveal() {
    if (revealed) return
    revealed = true
    clearTimeout(revealTimer)
    setTitleSaved()
    card.classList.add('revealed')
    renderVisibility() // status line: "Saved ✓ …"
    renderRows()
    el('pbody').classList.add('open')
    armIdle()
  }

  // Optimistic open: full card, "Saved ✓", prefetched lists — before the save
  // confirms. Only the sticky-private default is known at this point.
  function showOptimistic(data) {
    revealMsg = 'Saved'
    bookmarkId = null
    profileUrl = null
    isSecret = !!(data && data.isPrivate)
    const seq = ++saveSeq
    memberOf = new Set()
    clearTimeout(revealTimer)
    revealTimer = setTimeout(reveal, REVEAL_TIMEOUT_MS)
    const useprefetch = () => {
      if (seq !== saveSeq) return
      lists = prefetched || []
      reveal()
    }
    if (prefetched !== null) useprefetch()
    else onPrefetch = useprefetch
  }

  // The save confirmed (or, without a prior optimistic open, the legacy path:
  // reveal now). Late truths fold in quietly: the title becomes a live link,
  // queued actions flush against the real id, a re-save pulls its memberships.
  function showSaved(msg, data) {
    revealMsg = msg
    bookmarkId = (data && data.id) || null
    profileUrl = (data && data.profileUrl) || null
    if (!bookmarkId) {
      pending = []
      return terminal(msg, '')
    }
    // The server's visibility is the pre-queue truth — don't clobber a flip
    // the user made while the save was in flight (it's queued right behind).
    if (!userToggledVis) isSecret = !!(data && data.isPrivate)
    const seq = ++saveSeq

    if (revealed) {
      // Optimistic card already open — this is the confirm.
      if (undone) {
        // The user already undid this save — the fold stays; the flush
        // performs the queued delete against the id that just arrived.
        flushPending(bookmarkId)
        return
      }
      setTitleSaved()
      renderVisibility()
      flushPending(bookmarkId)
      if (data && data.refreshed) {
        // A re-save is already filed places — pull memberships; checked rows
        // pop in a beat late, which beats holding the whole card for them.
        chrome.runtime.sendMessage({ type: 'ig-get-lists', bookmarkId }, (resp) => {
          if (seq !== saveSeq) return
          if (resp && resp.ok && Array.isArray(resp.lists)) {
            lists = resp.lists
            for (const id of resp.memberOf || []) memberOf.add(id)
            renderRows()
          }
        })
      }
      return
    }

    clearTimeout(revealTimer)
    revealTimer = setTimeout(reveal, REVEAL_TIMEOUT_MS)
    if (data && data.refreshed) {
      chrome.runtime.sendMessage({ type: 'ig-get-lists', bookmarkId }, (resp) => {
        if (seq !== saveSeq) return
        if (resp && resp.ok && Array.isArray(resp.lists)) {
          lists = resp.lists
          memberOf = new Set(resp.memberOf || [])
        }
        reveal()
      })
      return
    }
    memberOf = new Set()
    const useprefetch = () => {
      if (seq !== saveSeq) return
      lists = prefetched || []
      reveal()
    }
    if (prefetched !== null) useprefetch()
    else onPrefetch = useprefetch
  }

  // Terminal without the picker (duplicate / error / signin): title flips,
  // dot stops, message in the status line, quiet dismiss.
  function terminal(word, note, { err = false } = {}) {
    // May arrive after an optimistic reveal (the in-flight save failed) —
    // fold the picker back down and drop anything the user queued against it.
    pending = []
    revealed = false
    card.classList.remove('revealed')
    el('pbody').classList.remove('open')
    el('ptitle').textContent = 'Save to your Bulletin'
    el('hslot').classList.add('off')
    setStatus(word, note, { check: !err, err })
    armIdle(6000)
  }

  // ── controller ─────────────────────────────────────────────────────
  function reset() {
    ++saveSeq
    clearTimeout(revealTimer)
    clearTimeout(idleTimer)
    onPrefetch = null
    prefetchLists() // re-warm — a list created since injection should show
    bookmarkId = null
    profileUrl = null
    isSecret = false
    pending = []
    userToggledVis = false
    undone = false
    lists = []
    memberOf = new Set()
    creating = false
    revealed = false
    card.classList.remove('revealed')
    el('hslot').classList.remove('off')
    el('undo').disabled = false
    el('pstatus').classList.remove('shown', 'err')
    el('pbody').classList.remove('open')
    screens.classList.remove('show-create')
    el('ptitle').textContent = 'Saving to your Bulletin'
    el('vis').setAttribute('aria-checked', 'false')
    nameInput.value = ''
  }

  window.__igToast = {
    reset,
    apply(state, data) {
      if (state === 'saving') {
        reset()
      } else if (state === 'optimistic') {
        reset()
        showOptimistic(data)
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
    if (!m || m.type !== 'ig-toast') return
    if (window.__igToast) {
      window.__igToast.apply(m.state, m.data)
    } else if (m.state === 'saved' && m.data && m.data.id) {
      // The card was dismissed while the save was still in flight — flush any
      // actions the user queued (filed a list, flipped secret, undid) so a
      // quick dismiss can't eat their click. flushPending self-empties, so a
      // second stale listener finds nothing to double-send.
      flushPending(m.data.id)
    }
  })

  // First injection starts in the saving state by markup — warm the list names
  // now so the reveal waits on the save alone.
  prefetchLists()
})()
