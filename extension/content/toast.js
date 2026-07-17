// On-page "Saved to your Bulletin" toast — injected into the active tab by the
// background worker. Two stacked cards (design_handoff_save_to_bulletin):
//   1. Confirmation card — a vertical loading bar + "Saving to your Bulletin…",
//      flipping to a radio indicator + "Saved to your Bulletin" when the save
//      lands.
//   2. List card — mounts after the save, already open. No search field, no
//      chevron, no colored dots: every option is just there. Lists we suggest
//      for this page (tap to create + file), the user's existing lists (tap to
//      file), and a persistent create row at the bottom.
//
// Design principle: saving is already complete; the list card is a low-friction
// offer, never a requirement. The palette is deliberately neutral — quietness is
// the point, so nothing here competes with the page underneath.
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
//   { type: 'ig-get-lists', bookmarkId? }             → { ok, lists, memberOf } | { error }
//   { type: 'ig-suggest-lists', bookmarkId }          → { ok, names } | { error }
//   { type: 'ig-create-list', name, bookmarkId }      → { ok, list, url } | { error }
//   { type: 'ig-set-list', listId, bookmarkId, add }  → { ok } | { error }

;(() => {
  // Guard against double-injection: reuse the existing controller if the user
  // clicks again on the same page.
  if (window.__igToast) {
    window.__igToast.reset()
    return
  }

  // Idle window before the toast dismisses itself, counted down by the bar along
  // the confirmation card's bottom edge. Longer than a bare confirmation would
  // need because the list card is an open invitation to read and file — hovering
  // or typing pauses it, and filing restarts it (see armBar).
  //
  // Must be fed to CSS as a real value: `animation: barLoad var(--dismiss)` with
  // --dismiss undefined is invalid at computed-value time, which silently
  // resolves animation-name to `none`. That's what used to happen here, and
  // since animationend is what dismisses, the toast never went away at all.
  const DISMISS_MS = 8000

  // Self-hosted brand serif (declared in manifest web_accessible_resources).
  // Substituted for the handoff's EB Garamond to keep the extension buildless.
  const FONT_CARDO = chrome.runtime.getURL('fonts/Cardo-Regular.woff2')
  const FONT_CARDO_BOLD = chrome.runtime.getURL('fonts/Cardo-Bold.woff2')

  const host = document.createElement('div')
  host.id = 'internet-gems-toast-host'
  // `all:initial` MUST come first — it resets every property, so the positioning
  // after it survives. Put it last and it wipes out position:fixed.
  host.style.cssText =
    'all:initial;position:fixed;top:26px;right:26px;z-index:2147483647;'
  const root = host.attachShadow({ mode: 'open' })

  root.innerHTML = `
    <style>
      @font-face { font-family:'Cardo'; src:url('${FONT_CARDO}') format('woff2'); font-weight:400; font-display:swap; }
      @font-face { font-family:'Cardo'; src:url('${FONT_CARDO_BOLD}') format('woff2'); font-weight:700; font-display:swap; }
      :host { all: initial; }
      * { box-sizing: border-box; }
      ::selection { background: #e4e2de; }

      @keyframes toastIn { from { opacity:0; transform:translateY(8px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
      @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      /* Round 1 — indeterminate: a segment sweeping the card's width while the
         save is in flight. We can't know how long that takes, so it loops.
         Travels exactly edge to edge (-34% is fully off-left, 100% fully
         off-right) and LINEAR on purpose: ease-in-out lingers at both ends,
         which here are off-card, so the segment would park out of sight and
         blink across the middle. */
      @keyframes barSweep { from { left:-34%; } to { left:100%; } }
      /* Round 2 — determinate: fills 0→100% over the pick-a-list window. */
      @keyframes barLoad { from { width:0%; } to { width:100%; } }

      .wrap {
        width: 320px; display: flex; flex-direction: column; gap: 11px;
        font-family: 'Cardo', 'EB Garamond', Georgia, serif;
      }

      .card { background:#fff; border-radius:15px; box-shadow:0 12px 30px rgba(20,18,14,0.20); }
      .conf {
        position: relative; overflow: hidden; padding:15px 17px;
        animation: toastIn 300ms cubic-bezier(0.2,0.8,0.2,1) both;
      }

      /* One bar along the BOTTOM edge of the confirmation card, running two
         rounds back to back: it sweeps while the link saves, then counts down
         the window to pick a list. The countdown's animationend is the single
         source of truth for dismissal, so the countdown a user sees is exactly
         the countdown that fires, and pausing the bar pauses the dismiss for
         free. The sweep loops forever, so it can never fire animationend. */
      .bar { position:absolute; left:0; bottom:0; height:3px; }
      .bar[hidden] { display:none; }
      .bar.sweep { width:34%; background:#b4b0aa; animation: barSweep 1.15s linear infinite; }
      .bar.load  { width:0;   background:#cbc9c3; animation: barLoad var(--dismiss) linear both; }
      .lists { overflow:hidden; padding-top:6px; animation: fadeUp .3s ease both; }
      .lists[hidden] { display:none; }

      /* ── confirmation card ── */
      /* The indicator keeps its 30px slot in every state, so the copy never
         shifts sideways when the save lands — the ring just gains its dot. */
      .conf-row { display:flex; align-items:center; gap:13px; }

      .radio { flex:none; width:30px; height:30px; border-radius:50%; background:#ececec; display:flex; align-items:center; justify-content:center; }
      .radio .dot { width:12px; height:12px; border-radius:50%; background:#9a9a9a; }
      .radio .warn { font-size:15px; line-height:1; color:#8a857c; }

      .conf-text { font-size:19px; color:#1c1c1c; line-height:1.25; }
      .conf-row.saving .conf-text { font-size:18px; color:#8a857c; }
      .conf-sub { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px; color:#b0b0b0; line-height:1.45; padding:8px 0 0 43px; }
      .conf-sub[hidden] { display:none; }

      /* ── list card ── */
      .group[hidden] { display:none; }
      .label {
        font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
        font-size:9px; letter-spacing:1.5px; color:#b0b0b0;
        padding:9px 17px 3px; text-transform:uppercase;
      }
      .divider { height:1px; background:#efefef; }
      .divider[hidden] { display:none; }

      .lrow { display:flex; align-items:center; gap:10px; padding:9px 17px; cursor:pointer; }
      .lrow:hover { background:#faf7f4; }
      .lrow .lname { flex:1; font-size:16px; color:#1c1c1c; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .lrow .lcheck { flex:none; width:16px; height:16px; color:#3a3a3a; display:flex; }
      .lrow .lnew {
        flex:none; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
        font-size:8px; letter-spacing:1px; color:#9a9a9a;
        border:1px solid #dcdcdc; border-radius:4px; padding:2px 5px;
      }

      /* ── create row: a button that swaps into an inline input ── */
      .create { background:#faf8f6; }
      .create-btn { display:flex; align-items:center; gap:10px; padding:11px 17px; cursor:pointer; }
      .create-row { display:flex; align-items:center; gap:10px; padding:9px 17px; }
      .create-btn[hidden], .create-row[hidden] { display:none; }
      .plus { flex:none; font-size:19px; line-height:1; color:#9a9a9a; }
      .create-btn .clabel { font-size:16px; color:#1c1c1c; }
      .create-input {
        flex:1; min-width:0; border:none; outline:none; background:transparent;
        font-family:'Cardo','EB Garamond',Georgia,serif; font-size:16px; color:#1c1c1c;
      }
      .create-input::placeholder { color:#b6b6b6; }
      .ckey {
        flex:none; font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
        font-size:9px; letter-spacing:1px; color:#9a9a9a;
        border:1px solid #dcdcdc; border-radius:6px; padding:3px 7px; cursor:pointer;
      }
      /* Darkens once the name is committable — the chip is the Enter affordance. */
      .ckey.armed { color:#6b6b6b; border-color:#c4c4c4; }
    </style>
    <div class="wrap" id="wrap" style="opacity:0">
      <div class="card conf" id="conf">
        <div class="bar" id="bar" hidden></div>
        <div class="conf-row saving" id="confrow">
          <span class="radio" id="ind"></span>
          <div class="conf-text" id="msg">Saving to your Bulletin…</div>
        </div>
        <div class="conf-sub" id="sub" hidden></div>
      </div>

      <div class="card lists" id="lists" hidden>
        <div class="group" id="group-suggested" hidden>
          <div class="label">Suggested for this page</div>
          <div id="rows-suggested"></div>
          <div class="divider"></div>
        </div>
        <div class="group" id="group-yours" hidden>
          <div class="label">Your lists</div>
          <div id="rows-yours"></div>
        </div>
        <div class="divider" id="div-create" hidden></div>
        <div class="create">
          <div class="create-btn" id="create-btn">
            <span class="plus">+</span>
            <span class="clabel">Create a new list</span>
          </div>
          <div class="create-row" id="create-row" hidden>
            <span class="plus">+</span>
            <input class="create-input" id="create-input" placeholder="Name your list"
                   autocomplete="off" spellcheck="false" />
            <span class="ckey" id="ckey">ENTER</span>
          </div>
        </div>
      </div>
    </div>
  `

  const el = (id) => root.getElementById(id)
  const wrap = el('wrap')
  const createInput = el('create-input')

  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'

  // ── state ──────────────────────────────────────────────────────────
  let bookmarkId = null
  let hovering = false
  let inputFocused = false
  // The user's existing lists [{ id, name, slug }] and which ones hold this gem.
  let lists = []
  let memberOf = new Set()
  // Lists we're proposing for this page. `listId` is null until the user taps
  // one — that's when it becomes real. They stay in this group afterwards rather
  // than jumping to "Your lists", so the row the user clicked doesn't move.
  let suggested = []
  let creating = false
  // Ids for optimistic rows that exist on screen before they exist server-side.
  let pendingSeq = 0

  document.documentElement.appendChild(host)
  requestAnimationFrame(() => { wrap.style.opacity = '1' })

  // ── auto-dismiss ───────────────────────────────────────────────────
  const bar = el('bar')
  wrap.style.setProperty('--dismiss', `${DISMISS_MS}ms`)
  // Only the countdown ends the toast. `barSweep` loops forever and never fires
  // this, but name-check anyway so the two rounds can't be confused.
  bar.addEventListener('animationend', (e) => {
    if (e.animationName === 'barLoad') dismiss()
  })

  // Round 1 — the link is saving. Indeterminate: we don't know how long.
  function sweepBar() {
    bar.hidden = false
    bar.className = 'bar sweep'
    bar.style.animationPlayState = 'running'
  }
  // Round 2 — the link is saved; this is the user's window to pick a list.
  function armBar() {
    bar.hidden = false
    bar.className = 'bar'
    // Force reflow so re-adding .load restarts the countdown from 0.
    void bar.offsetWidth
    bar.className = 'bar load'
    updateBarPause()
  }
  function stopBar() {
    bar.className = 'bar'
    bar.hidden = true
  }
  function updateBarPause() {
    // Pause the countdown (and thus the dismiss) while the pointer is over the
    // toast or the user is typing a list name.
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
  // The ring is empty while saving and gains its dot (or a warn glyph) once the
  // save resolves. Motion lives in the bar at the card's bottom edge, not here.
  function setConfState(kind) {
    el('confrow').classList.toggle('saving', kind === 'saving')
    el('ind').innerHTML =
      kind === 'saving' ? '' : kind === 'warn' ? '<span class="warn">!</span>' : '<span class="dot"></span>'
  }

  // ── list card ──────────────────────────────────────────────────────
  function row({ name, checked, isNew, onClick }) {
    const r = document.createElement('div')
    r.className = 'lrow'
    r.title = name
    r.innerHTML =
      '<span class="lname"></span>' +
      (isNew ? '<span class="lnew">NEW</span>' : '') +
      (checked ? `<span class="lcheck">${CHECK_SVG}</span>` : '')
    r.querySelector('.lname').textContent = name
    // Filing restarts the countdown — the user is still working.
    r.addEventListener('click', (e) => { e.stopPropagation(); armBar(); onClick() })
    return r
  }

  function render() {
    // Suggested — proposals for this page. A suggestion the user has acted on
    // keeps its row but drops the NEW tag.
    const sRows = el('rows-suggested')
    sRows.innerHTML = ''
    for (const s of suggested) {
      sRows.appendChild(
        row({
          name: s.name,
          // Check it the moment it's tapped, not when the create returns.
          checked: s.pending || (!!s.listId && memberOf.has(s.listId)),
          isNew: !s.listId && !s.pending,
          onClick: () => toggleSuggested(s),
        })
      )
    }
    el('group-suggested').hidden = suggested.length === 0

    // Your lists — what already exists.
    const yRows = el('rows-yours')
    yRows.innerHTML = ''
    for (const l of lists) {
      yRows.appendChild(
        row({
          name: l.name,
          checked: memberOf.has(l.id),
          isNew: false,
          onClick: () => toggleListMembership(l),
        })
      )
    }
    el('group-yours').hidden = lists.length === 0

    // Only rule off the create row when there's something above it to separate.
    el('div-create').hidden = suggested.length === 0 && lists.length === 0
    el('create-btn').hidden = creating
    el('create-row').hidden = !creating
    el('ckey').classList.toggle('armed', createInput.value.trim().length > 0)
  }

  // ── create row ─────────────────────────────────────────────────────
  el('create-btn').addEventListener('click', () => {
    creating = true
    render()
    createInput.focus()
  })
  createInput.addEventListener('focus', () => { inputFocused = true; updateBarPause() })
  createInput.addEventListener('blur', () => { inputFocused = false; armBar() })
  createInput.addEventListener('input', () => render())
  createInput.addEventListener('keydown', (e) => {
    // Mid-IME-composition Enter commits the candidate word, not the list name.
    if (e.isComposing || e.keyCode === 229) return
    // keyCode is the fallback for setups that leave `key` unset.
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault()
      commitNewList()
    } else if (e.key === 'Escape' || e.keyCode === 27) {
      e.preventDefault()
      createInput.value = ''
      creating = false
      render()
    }
  })
  el('ckey').addEventListener('click', () => commitNewList())

  function closeCreateRow() {
    createInput.value = ''
    creating = false
    render()
  }

  function commitNewList() {
    const typed = createInput.value.trim()
    if (!typed) return // empty names are ignored, per the handoff
    // Typing the name of a list they already have files into it rather than
    // minting a near-duplicate. This also matches the optimistic row below, so a
    // second Enter on the same name can never start a second create.
    const exact = lists.find((l) => l.name.toLowerCase() === typed.toLowerCase())
    if (exact) {
      if (!exact.pending && !memberOf.has(exact.id)) toggleListMembership(exact)
      closeCreateRow()
      return
    }
    // Show the filed row NOW rather than after the round-trip. The create takes
    // a slug query + insert, and during that gap the old code left the typed
    // name sitting in the box with no feedback — so Enter felt dead and a second
    // press minted a second identical list.
    const temp = { id: `pending-${++pendingSeq}`, name: typed, pending: true }
    lists.unshift(temp)
    memberOf.add(temp.id)
    closeCreateRow()
    armBar() // they're still working — restart the countdown

    createList(
      typed,
      (list) => {
        // Swap the placeholder for the real row, in place.
        const i = lists.indexOf(temp)
        if (i !== -1) lists[i] = list
        memberOf.delete(temp.id)
        memberOf.add(list.id)
        render()
      },
      () => {
        // Roll back and hand the name back so the typing isn't lost.
        const i = lists.indexOf(temp)
        if (i !== -1) lists.splice(i, 1)
        memberOf.delete(temp.id)
        createInput.value = typed
        creating = true
        render()
        createInput.focus()
      }
    )
  }

  // ── filing ─────────────────────────────────────────────────────────
  // Optimistically toggle membership, then reconcile with the server.
  function toggleListMembership(l) {
    // A row still being created has no real id yet — the server would reject it.
    if (!bookmarkId || l.pending) return
    const add = !memberOf.has(l.id)
    if (add) memberOf.add(l.id)
    else memberOf.delete(l.id)
    render()
    chrome.runtime.sendMessage(
      { type: 'ig-set-list', listId: l.id, bookmarkId, add },
      (resp) => {
        if (!resp || resp.error) {
          if (add) memberOf.delete(l.id)
          else memberOf.add(l.id)
          render()
        }
      }
    )
  }

  // A suggested row is a list that doesn't exist yet. First tap creates it and
  // files the gem; after that it toggles like any other list.
  function toggleSuggested(s) {
    if (!bookmarkId || s.pending) return
    if (s.listId) return toggleListMembership({ id: s.listId, name: s.name })
    s.pending = true
    render() // check it immediately; reconcile when the create lands
    createList(
      s.name,
      (list) => {
        s.pending = false
        s.listId = list.id
        memberOf.add(list.id)
        render()
      },
      () => {
        s.pending = false
        render()
      }
    )
  }

  // Create + publish a list and file this bullet into it.
  function createList(name, onOk, onErr) {
    chrome.runtime.sendMessage(
      { type: 'ig-create-list', name, bookmarkId },
      (resp) => {
        if (resp && resp.ok && resp.list) onOk(resp.list)
        else if (onErr) onErr()
      }
    )
  }

  // ── data ───────────────────────────────────────────────────────────
  // Called twice per save: once on inject (no gem yet — just the names, so the
  // card is ready the instant the bullet lands), then again once we have an id,
  // which is what fills in the checkmarks for a bullet saved earlier.
  function loadLists(forId) {
    chrome.runtime.sendMessage({ type: 'ig-get-lists', bookmarkId: forId }, (resp) => {
      if (resp && resp.ok && Array.isArray(resp.lists)) {
        // Keep any optimistic rows the server hasn't heard about yet, or a
        // refetch landing mid-create would make the new row vanish.
        lists = [...lists.filter((l) => l.pending), ...resp.lists]
        // Only trust server membership for the gem we asked about, and never let
        // it clobber a toggle the user made while the request was in flight.
        if (forId && forId === bookmarkId && Array.isArray(resp.memberOf)) {
          for (const id of resp.memberOf) memberOf.add(id)
        }
        // A suggestion the server didn't know about may duplicate a list we've
        // since loaded — drop it rather than show the same name twice.
        const own = new Set(lists.map((l) => l.name.toLowerCase()))
        suggested = suggested.filter((s) => s.listId || !own.has(s.name.toLowerCase()))
        render()
      }
    })
  }

  // Suggestions need the saved gem, so this can only run once the save lands.
  // Off the critical path: the list card is already up and usable without them.
  function loadSuggestions() {
    if (!bookmarkId) return
    const forId = bookmarkId
    chrome.runtime.sendMessage({ type: 'ig-suggest-lists', bookmarkId }, (resp) => {
      // A second save may have landed while Haiku was thinking.
      if (forId !== bookmarkId) return
      if (!resp || !resp.ok || !Array.isArray(resp.names)) return
      const own = new Set(lists.map((l) => l.name.toLowerCase()))
      suggested = resp.names
        .filter((n) => n && !own.has(n.toLowerCase()))
        .map((name) => ({ name, listId: null, pending: false }))
      render()
      armBar() // new rows appeared — give them time to be read
    })
  }

  // ── saved: reveal the list card ────────────────────────────────────
  function showSaved(msg, data) {
    setConfState('saved')
    setMsg(msg)
    setSub('')
    bookmarkId = (data && data.id) || null
    if (bookmarkId) {
      el('lists').hidden = false
      memberOf = new Set()
      render()
      // Re-ask now that we have an id. A brand-new bullet is in no lists and
      // this changes nothing, but a re-save ("Already in your Bulletin") gets
      // its existing checkmarks back.
      loadLists(bookmarkId)
      loadSuggestions()
    } else {
      el('lists').hidden = true
    }
    armBar()
  }

  function showWarn(msg, sub) {
    setConfState('warn')
    setMsg(msg)
    setSub(sub)
    el('lists').hidden = true
    armBar()
  }

  // ── controller exposed to background messages ──────────────────────
  function reset() {
    sweepBar()
    bookmarkId = null
    lists = []
    memberOf = new Set()
    suggested = []
    creating = false
    createInput.value = ''
    el('lists').hidden = true
    setSub('')
    setConfState('saving')
    setMsg('Saving to your Bulletin…')
    render()
    // Prefetch lists in parallel with the save round-trip so the card is ready
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
        showWarn('Session expired — sign in to save', 'Click the Bulletin icon to sign in again.')
      } else if (state === 'error') {
        showWarn('Couldn’t save', (data && data.message) || 'Something went wrong — try again.')
      }
    },
  }

  // First injection in a tab doesn't go through reset(): start the saving sweep
  // and kick off the list prefetch so it overlaps the in-flight save.
  sweepBar()
  loadLists()

  chrome.runtime.onMessage.addListener((m) => {
    if (m && m.type === 'ig-toast' && window.__igToast) {
      window.__igToast.apply(m.state, m.data)
    }
  })
})()
