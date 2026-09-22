// On-page save card — injected into the active tab by the background worker.
// The WHOLE save experience lives here, mymind-style: clicking the toolbar
// icon saves immediately and this floating rounded card top-right is what you
// watch, not a popup.
//
// Design: Figma "Extension 21.09.26" (ProjectX 1138:297121). Two moments:
//   1. Saving — the grey band alone: "Saving to your Bulletin..." and the B
//      tile breathing top-right.
//   2. Saved  — the band settles ("Saved to your Bulletin" / "Now, publish to
//      a list...") and the picker unfolds below in ONE paint: the three lists
//      you used most recently, each a row with a ↗ to its page and a dot
//      that fills when the bullet is in it; "All other lists" folding the
//      rest under a chevron; and "Create new list", which turns into a field
//      in place — type, press Enter, "Saved!".
//
// There is no visibility control. Filing is publishing (migration 028): a
// bullet in a list is on your page, a bullet in no list is yours alone. The
// picker IS the switch.
//
// Dismissal: an idle timer after the reveal (paused while hovering or typing),
// Escape, or clicking anywhere outside the card. Undo is the quiet grey word
// at the end of the subtitle line (Tim, 2026-09-04) — deletes the save.
//
// Injected via chrome.scripting.executeScript({ files: [...] }) so it runs as
// a content script in the isolated world. All UI lives in a shadow root so the
// host page's CSS never leaks in (or out).
//
// Protocol — background → card (chrome.tabs.sendMessage):
//   { type: 'ig-toast', state: 'saving' }
//   { type: 'ig-toast', state: 'optimistic' }
//   { type: 'ig-toast', state: 'saved',     data: { id, title, refreshed, profileUrl } }
//   { type: 'ig-toast', state: 'duplicate', data: { id, title } }
//   { type: 'ig-toast', state: 'signin' }
//   { type: 'ig-toast', state: 'error',     data: { message } }
// Protocol — card → background (chrome.runtime.sendMessage):
//   { type: 'ig-get-lists', bookmarkId }            → { ok, lists, memberOf, username, origin }
//   { type: 'ig-create-list', name, bookmarkId }    → { ok, list, url }
//   { type: 'ig-set-list', listId, bookmarkId, add } → { ok }
//   { type: 'ig-delete-bullet', bookmarkId }        → { ok }

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
  // Lists on top before the fold. The rest sit under "All other lists".
  const TOP_ROWS = 3

  // Brand fonts, same cuts as the web app (declared in web_accessible_resources).
  const FONT_BOOK = chrome.runtime.getURL('fonts/MierA-Book.woff2')
  const FONT_REGULAR = chrome.runtime.getURL('fonts/MierA-Regular.woff2')
  const FONT_SERIF = chrome.runtime.getURL('fonts/Cardo-Regular.woff2')
  // The tile's mark (Tim's asset, 2026-09-22). Must be listed in the
  // manifest's web_accessible_resources or the page can't load it.
  const MARK = chrome.runtime.getURL('icons/mark.png')

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
      @font-face { font-family:'Cardo'; src:url('${FONT_SERIF}') format('woff2'); font-weight:400; font-display:swap; }
      :host { all: initial; }
      * { box-sizing: border-box; }
      ::selection { background: #e4e2de; }

      @keyframes cardIn { from { opacity:0; transform:translateY(8px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
      @keyframes breathe {
        0%, 100% { opacity: 0.35; transform: scale(0.96); }
        50%      { opacity: 1;    transform: scale(1); }
      }

      .card {
        width: 383px;
        font-family: 'Mier A', system-ui, sans-serif;
        color: #000;
        background: #fff;
        border-radius: 20px;
        box-shadow: 0 12px 30px rgba(20,18,14,0.22);
        overflow: hidden;
        animation: cardIn 300ms cubic-bezier(0.2,0.8,0.2,1) both;
      }

      /* ── header band ── */
      /* 92px, tightened from the Figma's 115 (Tim: "quite tall"). Layout per
         Tim's 2026-09-22 frame: mark tile LEFT, title + subtitle beside it,
         Undo tucked in the top-right corner. */
      .phead {
        position: relative; flex: none;
        display: flex; align-items: center; gap: 20px;
        height: 92px; padding: 0 30px 0 26px;
        background: #f5f5f5;
      }
      .ptext { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
      .ptitle {
        margin: 0; font-weight: 500; font-size: 18px; line-height: 24px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .ptitle a { color: inherit; text-decoration: none; }
      .ptitle a:hover { text-decoration: underline; text-underline-offset: 3px; }
      /* Subtitle line — folded away while saving. Cardo, the web's serif. */
      .psub {
        display: block;
        font-family: 'Cardo', Georgia, serif; font-size: 14px; line-height: 18px;
        color: #3a3a3a;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        max-height: 0; margin-top: 0; opacity: 0;
        transition: opacity 260ms ease 60ms, max-height 260ms ease, margin-top 260ms ease;
      }
      .revealed .psub, .terminal .psub { max-height: 18px; margin-top: 3px; opacity: 1; }
      .terminal.err .psub { color: #a31f34; }
      /* Undo — the quiet serif word in the band's top-right corner. Only
         once there's a save. */
      .undo {
        position: absolute; top: 12px; right: 30px;
        padding: 0; border: none; background: none;
        font-family: 'Cardo', Georgia, serif; font-size: 14px; line-height: 18px;
        color: #000; cursor: pointer;
        opacity: 0; pointer-events: none; transition: opacity 200ms ease;
      }
      .revealed .undo { opacity: 1; pointer-events: auto; }
      .undo:hover { text-decoration: underline; text-underline-offset: 2px; }
      .undo:disabled, .undone .undo { opacity: 0; pointer-events: none; }

      /* The mark's tile, leading the band: white, 48px, the mark inside. */
      .tile {
        flex: none;
        width: 48px; height: 48px; border-radius: 12px; background: #fff;
        display: flex; align-items: center; justify-content: center;
      }
      .tile img { height: 26px; width: auto; display: block; }
      .saving .tile img { animation: breathe 1.4s ease-in-out infinite; }
      /* No tile in a terminal state → the message takes the band. */
      .terminal .tile { display: none; }
      .terminal .phead { padding-left: 30px; }

      /* ── body: the picker ── */
      .pbody {
        display: flex; flex-direction: column; min-height: 0;
        max-height: 0; opacity: 0; overflow: hidden;
        transition: max-height 360ms cubic-bezier(0.2,0.8,0.2,1), opacity 280ms ease 60ms;
      }
      .pbody.open { max-height: var(--body-h, 520px); opacity: 1; }

      .row {
        position: relative; flex: none;
        display: flex; align-items: center; justify-content: space-between; gap: 14px;
        height: 64px; padding: 0 30px;
        border-bottom: 1px solid #ececec;
        cursor: pointer; user-select: none;
      }
      /* Every row rules off below it — including the last list above
         "Create new list" (Tim, 2026-09-22); only the create row itself,
         at the card's foot, has no line under it. */
      .row.create { border-bottom: none; }
      /* display:flex above would beat the UA's [hidden] rule. */
      .row[hidden] { display: none; }
      /* Names sit at 70% and come up to full black under the pointer
         (Tim, 2026-09-22); hover still speaks in underline (2026-09-04). */
      .rname {
        display: flex; align-items: center; gap: 6px; min-width: 0;
        font-weight: 500; font-size: 16px; line-height: 24px;
        color: rgba(0,0,0,0.7); transition: color 150ms ease;
      }
      .row:hover .rname { color: #000; }
      .rname span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .row:hover .rname span { text-decoration: underline; text-underline-offset: 3px; }
      /* The ↗ is the web's arrow: a text glyph, not a stroke. It alone links
         to the list's page; the rest of the row files. */
      .go {
        flex: none; display: inline-flex; align-items: center; justify-content: center;
        width: 20px; height: 20px; border-radius: 6px;
        color: inherit; text-decoration: none; font-weight: 400; font-size: 15px; line-height: 1;
        transform: translateY(1px);
      }
      .go:hover { background: #ececec; }
      .go[hidden] { display: none; }
      .dot {
        flex: none; width: 17px; height: 17px; border-radius: 50%; background: #e4e4e4;
        display: flex; align-items: center; justify-content: center;
      }
      .dot::after {
        content: ''; width: 9px; height: 9px; border-radius: 50%; background: #000;
        transform: scale(0);
        transition: transform 140ms cubic-bezier(0.3,0.7,0.3,1.2);
      }
      .row.on .dot::after { transform: scale(1); }

      /* The fold: the rest of the lists under a chevron. Opening it swaps the
         "All other lists" row for the rows themselves — all of them, no
         scrolling, the card just grows (Tim, 2026-09-22). One-way. */
      .more-head .chev { flex: none; width: 20px; height: 20px; color: #000; }
      .more { flex: none; display: none; }
      .more.open { display: block; }

      /* Create row — a label that becomes a field in place. */
      .create { cursor: text; }
      .clabel { font-weight: 400; font-size: 16px; line-height: 24px; white-space: nowrap; }
      .cfield {
        flex: 1; min-width: 0; height: 24px; padding: 0; border: none; background: none;
        font-family: inherit; font-weight: 400; font-size: 16px; line-height: 24px;
        color: #000; outline: none;
      }
      .cfield::placeholder { color: #9a9a9a; }
      .chint {
        flex: none; font-family: 'Cardo', Georgia, serif; font-size: 14px; line-height: 18px;
        color: #8a8a8a; white-space: nowrap;
        opacity: 0; transition: opacity 160ms ease;
      }
      .chint.show { opacity: 1; }
      .chint.saved { color: #000; }
      .create.editing .clabel { display: none; }
      .create:not(.editing) .cfield { display: none; }
      .create.done .cfield { color: #000; }
    </style>

    <div class="card saving" id="card">
      <header class="phead">
        <div class="tile" aria-hidden="true"><img src="${MARK}" alt="" /></div>
        <div class="ptext">
          <h1 class="ptitle" id="ptitle">Saving to your Bulletin...</h1>
          <div class="psub" id="psub-text">Now, publish to a list...</div>
        </div>
        <button class="undo" id="undo" aria-label="Undo this save">Undo</button>
      </header>

      <div class="pbody" id="pbody">
        <div id="top"></div>
        <div class="row more-head" id="more-head" hidden>
          <div class="rname"><span>All other lists</span></div>
          <svg class="chev" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"
               stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l5 5 5-5"/></svg>
        </div>
        <div class="more" id="more"></div>
        <div class="row create" id="create">
          <span class="clabel" id="clabel">Create new list</span>
          <input class="cfield" id="cfield" autocomplete="off" spellcheck="false" maxlength="80"
                 aria-label="New list name" />
          <span class="chint" id="chint">Press Enter</span>
        </div>
      </div>
    </div>
  `

  const el = (id) => root.getElementById(id)
  const card = el('card')
  const field = el('cfield')

  // ── state ──────────────────────────────────────────────────────────
  let bookmarkId = null
  let origin = null
  let username = null
  let profileUrl = null
  // Optimistic reveal: the card shows "Saved" the moment it opens, while the
  // real save is still in flight. Anything the user does before the bookmark id
  // arrives (file into a list, create one, undo) queues here and flushes the
  // moment the confirm lands. The user never feels the gap.
  let pending = []
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
  let hintTimer = null
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
      if (resp && resp.ok) {
        origin = resp.origin || origin
        username = resp.username || username
        if (origin && username) profileUrl = `${origin}/${username}`
      }
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
      if (!hovering && !typing) dismiss()
      else armIdle() // still busy — check again in a while
    }, ms)
  }
  function dismiss() {
    clearTimeout(idleTimer)
    clearTimeout(revealTimer)
    clearTimeout(hintTimer)
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

  // ── header ─────────────────────────────────────────────────────────
  // Once saved, the title is a live link to the user's page (underline on
  // hover) — or plain text if we don't know their handle yet.
  function setTitle(text, link) {
    const t = el('ptitle')
    t.innerHTML = ''
    if (link) {
      const a = document.createElement('a')
      a.href = link
      a.target = '_blank'
      a.rel = 'noopener'
      a.textContent = text
      t.appendChild(a)
    } else {
      t.textContent = text
    }
  }
  function setSub(text) {
    el('psub-text').textContent = text
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
    card.classList.add('terminal', 'undone')
    el('pbody').classList.remove('open')
    setTitle('Save to your Bulletin')
    setSub('Removed. This link is off your Bulletin.')
    armIdle(2500)
    withId((id) => {
      bookmarkId = null
      chrome.runtime.sendMessage({ type: 'ig-delete-bullet', bookmarkId: id }, (resp) => {
        if (!resp || resp.error) {
          card.classList.add('err')
          setSub('Couldn’t undo — it’s still saved.')
          armIdle(4000)
        }
      })
    })
  })

  // ── list rows ──────────────────────────────────────────────────────
  function listUrl(l) {
    return origin && username && l.slug ? `${origin}/${username}/${l.slug}` : null
  }
  function makeRow(l) {
    const r = document.createElement('div')
    r.className = 'row' + (memberOf.has(l.id) ? ' on' : '')
    r.dataset.id = l.id
    r.innerHTML =
      '<div class="rname"><span></span><a class="go" target="_blank" rel="noopener" aria-label="Open list">↗</a></div>' +
      '<span class="dot"></span>'
    r.querySelector('.rname span').textContent = l.name
    const go = r.querySelector('.go')
    const url = listUrl(l)
    if (url) go.href = url
    else go.hidden = true
    // The arrow opens the list; nothing else about the row should react.
    go.addEventListener('click', (e) => { e.stopPropagation() })
    r.addEventListener('click', () => toggleMembership(l, r))
    return r
  }
  function renderRows() {
    const top = el('top')
    const more = el('more')
    const head = el('more-head')
    top.innerHTML = ''
    more.innerHTML = ''
    lists.slice(0, TOP_ROWS).forEach((l) => top.appendChild(makeRow(l)))
    const rest = lists.slice(TOP_ROWS)
    rest.forEach((l) => more.appendChild(makeRow(l)))
    // The fold row shows only while there's something folded. Once opened
    // it stays open for this card (a re-render after filing/creating keeps
    // the rows out, no snapping shut).
    const folded = rest.length > 0 && !more.classList.contains('open')
    head.hidden = !folded
    // First list ever: the create row is the whole body, and says so.
    el('clabel').textContent = lists.length ? 'Create new list' : 'Create your first list'
    syncBodyHeight()
  }
  function syncBodyHeight() {
    const body = el('pbody')
    body.style.setProperty('--body-h', `${body.scrollHeight}px`)
  }
  el('more-head').addEventListener('click', () => {
    el('more').classList.add('open')
    el('more-head').hidden = true
    syncBodyHeight()
    armIdle()
  })
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

  // ── create row: label → field → "Saved!" ───────────────────────────
  const create = el('create')
  const hint = el('chint')
  function openCreate() {
    if (creating || create.classList.contains('done')) return
    create.classList.add('editing')
    field.value = ''
    field.placeholder = lists.length ? 'List name' : 'Name your first list'
    hint.textContent = 'Press Enter'
    hint.classList.remove('show', 'saved')
    field.focus({ preventScroll: true })
  }
  function closeCreate() {
    clearTimeout(hintTimer)
    create.classList.remove('editing', 'done')
    hint.classList.remove('show', 'saved')
    field.value = ''
    field.blur()
    typing = false
  }
  create.addEventListener('click', (e) => {
    if (create.classList.contains('editing')) return
    e.stopPropagation()
    openCreate()
  })
  field.addEventListener('focus', () => { typing = true })
  field.addEventListener('blur', () => {
    typing = false
    // Left empty → back to the label. Text stays put: they may come back.
    if (!field.value.trim() && !creating) closeCreate()
  })
  field.addEventListener('input', () => {
    hint.classList.toggle('show', field.value.trim().length > 0)
    armIdle()
  })
  field.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter') {
      e.preventDefault()
      commitCreate()
    } else if (e.key === 'Escape') {
      // Escape in the field backs out of the field, not out of the card —
      // stop it before the document-level close handler sees it.
      e.preventDefault()
      e.stopPropagation()
      closeCreate()
      armIdle()
    }
  })

  function commitCreate() {
    const name = field.value.trim()
    if (!name || creating) return

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
      // Surface the row it went into, then settle.
      lists = [exact, ...lists.filter((l) => l.id !== exact.id)]
      renderRows()
      closeCreate()
      armIdle()
      return
    }

    creating = true
    hint.textContent = 'Saving…'
    hint.classList.add('show')
    withId((id) =>
      chrome.runtime.sendMessage(
        { type: 'ig-create-list', name, bookmarkId: id },
        (resp) => {
          creating = false
          if (resp && resp.ok && resp.list) {
            // The row reads "<name>  Saved!" for a beat, then the new list
            // takes its place at the top — filed, dot filled — and the create
            // row is a label again.
            lists = [resp.list, ...lists.filter((l) => l.id !== resp.list.id)]
            memberOf.add(resp.list.id)
            create.classList.add('done')
            hint.textContent = 'Saved!'
            hint.classList.add('show', 'saved')
            armIdle()
            hintTimer = setTimeout(() => {
              renderRows()
              closeCreate()
            }, 1100)
          } else {
            hint.textContent = 'Couldn’t create — try again'
            hint.classList.add('show')
            field.focus({ preventScroll: true })
          }
        }
      )
    )
  }

  // ── the one-frame reveal ───────────────────────────────────────────
  // Saving → (lists in hand) → everything at once.
  function reveal() {
    if (revealed) return
    revealed = true
    clearTimeout(revealTimer)
    card.classList.remove('saving', 'terminal', 'err', 'undone')
    setTitle('Saved to your Bulletin', profileUrl)
    setSub('Now, publish to a list...')
    card.classList.add('revealed')
    renderRows()
    el('pbody').classList.add('open')
    armIdle()
  }

  // Optimistic open: full card, prefetched lists — before the save confirms.
  function showOptimistic() {
    bookmarkId = null
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
  // reveal now). Late truths fold in quietly: queued actions flush against the
  // real id, a re-save pulls its memberships.
  function showSaved(title, data) {
    bookmarkId = (data && data.id) || null
    if (data && data.profileUrl) profileUrl = data.profileUrl
    if (!bookmarkId) {
      pending = []
      return terminal(title, '')
    }
    const seq = ++saveSeq

    const pullMemberships = () => {
      chrome.runtime.sendMessage({ type: 'ig-get-lists', bookmarkId }, (resp) => {
        if (seq !== saveSeq) return
        if (resp && resp.ok && Array.isArray(resp.lists)) {
          lists = resp.lists
          for (const id of resp.memberOf || []) memberOf.add(id)
          renderRows()
        }
      })
    }

    if (revealed) {
      // Optimistic card already open — this is the confirm.
      if (undone) {
        // The user already undid this save — the fold stays; the flush
        // performs the queued delete against the id that just arrived.
        flushPending(bookmarkId)
        return
      }
      setTitle(title, profileUrl)
      flushPending(bookmarkId)
      // A re-save is already filed places — pull memberships; checked rows
      // pop in a beat late, which beats holding the whole card for them.
      if (data && data.refreshed) pullMemberships()
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
        setTitle(title, profileUrl)
      })
      return
    }
    memberOf = new Set()
    const useprefetch = () => {
      if (seq !== saveSeq) return
      lists = prefetched || []
      reveal()
      setTitle(title, profileUrl)
    }
    if (prefetched !== null) useprefetch()
    else onPrefetch = useprefetch
  }

  // Terminal without the picker (error / signin): title flips, the mark
  // stops, the message sits on the subtitle line, quiet dismiss.
  function terminal(title, note, { err = false } = {}) {
    // May arrive after an optimistic reveal (the in-flight save failed) —
    // fold the picker back down and drop anything the user queued against it.
    pending = []
    revealed = false
    card.classList.remove('revealed', 'saving')
    card.classList.add('terminal')
    card.classList.toggle('err', err)
    el('pbody').classList.remove('open')
    setTitle(title)
    setSub(note)
    armIdle(6000)
  }

  // ── controller ─────────────────────────────────────────────────────
  function reset() {
    ++saveSeq
    clearTimeout(revealTimer)
    clearTimeout(idleTimer)
    clearTimeout(hintTimer)
    onPrefetch = null
    prefetchLists() // re-warm — a list created since injection should show
    bookmarkId = null
    pending = []
    undone = false
    lists = []
    memberOf = new Set()
    creating = false
    revealed = false
    card.classList.remove('revealed', 'terminal', 'err', 'undone')
    card.classList.add('saving')
    el('undo').disabled = false
    el('pbody').classList.remove('open')
    el('more').classList.remove('open')
    setTitle('Saving to your Bulletin...')
    setSub('Now, publish to a list...')
    closeCreate()
  }

  window.__igToast = {
    reset,
    apply(state, data) {
      if (state === 'saving') {
        reset()
      } else if (state === 'optimistic') {
        reset()
        showOptimistic()
      } else if (state === 'saved') {
        showSaved(data && data.refreshed ? 'Updated in your Bulletin' : 'Saved to your Bulletin', data)
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
      // actions the user queued (filed a list, created one, undid) so a quick
      // dismiss can't eat their click. flushPending self-empties, so a second
      // stale listener finds nothing to double-send.
      flushPending(m.data.id)
    }
  })

  // First injection starts in the saving state by markup — warm the list names
  // now so the reveal waits on the save alone.
  prefetchLists()
})()
