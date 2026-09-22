'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// The owner's persistent "add" dock — a frosted + tile bottom-right that
// expands into THREE pills (Figma 1137:297120, plus one): "Create New List",
// "Add Bullet +" (paste one link) and "Bulk Import" (upload a CSV). Everything
// is anchored to the bottom-right and grows up/left; the pill row never moves,
// extra rows stack on top of it.
//
//   Create New List →  [ Name your list | ]     →  [ Created · Name ]
//                                                  [ Add Bullet +  ]
//                                                  [ Bulk Import   ]
//                                                  …then either door as usual,
//                                                  with the new list pre-picked.
//   Add Bullet +  →  [ Paste URL here | ]      →  [ Saved! ]
//                                                  [ Publish to these lists ⌄ ]
//   Bulk Import →  file dialog (Upload CSV)  →  [ Uploaded · file.csv ]
//                                                  [ (list picker panel) ]
//                                                  [ Publish to these lists ⌄ ]
//
// Creating a list lives here and nowhere else: the LISTS grid used to end in
// a "Create New List" card that turned itself into a form, and Tim cut it
// (2026-09-22) — one dock, one place things get made.
//
// The list picker can also mint a list on the spot ("+ New list" at its foot),
// the way the extension's can — so the reverse door works too: upload first,
// then name the list it goes into.
//
// Both flows converge on the same list picker: 18px rings, filled dot when
// selected, multi-select. The single-link flow saves first and applies list
// toggles immediately; the bulk flow stages selections and applies them to
// every link the run saves. Saving goes through /api/import either way — the
// same shared pipeline (metadata → screenshot → embedding) as the extension —
// and list membership is plain list_bookmarks rows, same as the profile grid.
//
// The deep bulk page (/import) stays for heavy migrations; this dock is the
// everyday door. Throttle and URL extraction are the same as that page's, so
// the per-save pipeline never gets slammed no matter which door is used.
const FOOTER_CLEARANCE = 'calc(55px + max(18px, env(safe-area-inset-bottom)))'

const MAX_LINKS = 500
const GAP_MS = 1500

// One URL out of whatever was pasted or typed — same forgiveness as bulk.
function parseOneUrl(raw: string): string | null {
  const t = raw.trim().replace(/^["'<]|[>"',;.]+$/g, '')
  if (!t || t.includes(' ')) return null
  const candidate = t.includes('://') ? t : /^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/.test(t) ? `https://${t}` : null
  if (!candidate) return null
  try {
    const u = new URL(candidate)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.href
  } catch {
    return null
  }
}

// Pull URLs out of arbitrary text — lifted from /import, same rules: explicit
// http(s) first, then bare-domain tokens on their own line/cell.
function extractUrls(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const push = (raw: string) => {
    const url = raw.replace(/[)\]}>,;.'"”’]+$/, '')
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
      if (seen.has(u.href)) return
      seen.add(u.href)
      found.push(u.href)
    } catch {}
  }
  for (const m of text.match(/https?:\/\/[^\s,"'<>]+/g) || []) push(m)
  for (const cell of text.split(/[\n,;\t]+/)) {
    const t = cell.trim().replace(/^["']|["']$/g, '')
    if (!t || t.includes(' ') || t.includes('@') || t.includes('://')) continue
    if (!/^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/.test(t)) continue
    push(`https://${t}`)
  }
  return found.slice(0, MAX_LINKS)
}

// The transient message dwell — long enough to read four words in Cardo.
const MESSAGE_MS = 1600

// ── Dressing ────────────────────────────────────────────────────────────────
// The pill frost, from Figma's Rectangle 5091 CSS: a 0.4 white milk layer,
// a grain texture overlay-blended at 30%, and a wide off-canvas radial
// darkening — over a 37px backdrop blur. Radius 10 per the dock mocks,
// tighter than the cards' 20; these are controls, not plates.
//
// The grain is Figma's 271KB noise PNG re-created as inline SVG turbulence
// (zero bytes, tiles seamlessly); the grey matrix + 0.3 alpha reproduce the
// export's opacity so the overlay blend lands at the same strength.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.3 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")"
const FROST_STYLE: React.CSSProperties = {
  background: `linear-gradient(0deg, rgba(255,255,255,0.4), rgba(255,255,255,0.4)), ${GRAIN}, radial-gradient(462.83% 303.02% at -145.2% -28.49%, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.0671875) 77.08%, rgba(0,0,0,0) 100%)`,
  backgroundBlendMode: 'normal, overlay, normal',
  boxShadow: 'inset 0.931372px 7.45098px 10.2451px rgba(255,255,255,0.55)',
  backdropFilter: 'blur(37.2549px)',
  WebkitBackdropFilter: 'blur(37.2549px)',
}
// The pill when it sits UNDER a shelf (Figma's stacked Rectangle 5091): the
// milk layer goes opaque #F1F1EF, and it gains a soft drop shadow plus an
// inner grey glow — a plate the shelf rests on, not a window over the cards.
const STACKED_STYLE: React.CSSProperties = {
  background: `linear-gradient(0deg, #F1F1EF, #F1F1EF), ${GRAIN}, radial-gradient(462.83% 303.02% at -145.2% -28.49%, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.0671875) 77.08%, rgba(0,0,0,0) 100%)`,
  backgroundBlendMode: 'normal, overlay, normal',
  boxShadow:
    '0px 4px 14px rgba(0,0,0,0.05), inset 0.931372px 7.45098px 10.2451px rgba(255,255,255,0.55), inset 0px 0px 31.6667px rgba(180,180,180,0.3)',
  backdropFilter: 'blur(37.2549px)',
  WebkitBackdropFilter: 'blur(37.2549px)',
}
// Glyph ink — the dot and the three dots.
const GLYPH = '#414141'
// The closed tile keeps its milk-free frost so the + reads white over cards.
const TILE_STYLE: React.CSSProperties = {
  background:
    'radial-gradient(140% 140% at 0% 0%, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.067) 77%, rgba(0,0,0,0) 100%)',
  boxShadow: 'inset 0.93px 7.45px 10.25px rgba(255,255,255,0.55)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
}

// Pill label — Editorial/Small: Cardo Regular 14/18, −0.02em.
const PILL_LABEL = 'font-serif text-[14px] leading-[18px] tracking-[-0.02em] text-ink'
// Row text — Body/Small: Mier A Book 12/16, +0.05em (400 = Book, inverted metadata).
const ROW_TEXT = 'font-sans text-[12px] font-[400] leading-4 tracking-[0.05em]'

type Flow =
  | { kind: 'menu' }
  // Single link: the paste input, then the saved + publish state.
  | { kind: 'paste'; busy: boolean; message: string | null }
  | { kind: 'published'; bulletId: string }
  // Bulk: file parsed and waiting, running, or finished.
  | { kind: 'bulk'; fileName: string; urls: string[] }
  | { kind: 'bulk-running'; fileName: string; urls: string[]; done: number }
  | { kind: 'bulk-done'; saved: number; skipped: number; failed: number }
  // New list: the name input, then the created shelf over the two doors.
  | { kind: 'name'; busy: boolean; message: string | null }
  | { kind: 'created' }

export function ImportFab({
  widthClassName = 'max-w-[1720px] px-4 sm:px-10',
  // The owner's lists, for the "Publish to these lists" picker.
  lists = [],
  // Called after links land, so the feed refreshes without a reload.
  onSaved,
  // Called after list membership changes, so list counts refresh.
  onListsChanged,
  // Mints a list (name → slug) and resolves its id, or null. Owned by the
  // profile because the lists state lives there; without it the dock simply
  // has no new-list affordances.
  onCreateList,
}: {
  widthClassName?: string
  lists?: { id: string; name: string }[]
  onSaved?: () => void
  onListsChanged?: () => void
  onCreateList?: (name: string) => Promise<string | null>
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [flow, setFlow] = useState<Flow>({ kind: 'menu' })
  const [value, setValue] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // The list this session was born to fill (Create New List → name → here).
  // Pre-picked in every picker until the dock folds.
  const [preset, setPreset] = useState<{ id: string; name: string } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelled = useRef(false)
  const running = flow.kind === 'bulk-running'

  useEffect(() => {
    if (open && (flow.kind === 'paste' || flow.kind === 'name')) inputRef.current?.focus({ preventScroll: true })
  }, [open, flow.kind])

  const startNewList = () => {
    setFlow({ kind: 'name', busy: false, message: null })
    setValue('')
    setPickerOpen(false)
    setSelected(new Set())
    setPreset(null)
  }

  useEffect(() => () => { if (messageTimer.current) clearTimeout(messageTimer.current) }, [])

  const reset = () => {
    setOpen(false)
    setFlow({ kind: 'menu' })
    setValue('')
    setPickerOpen(false)
    setSelected(new Set())
    setPreset(null)
    if (messageTimer.current) clearTimeout(messageTimer.current)
  }

  // Escape / click-outside are the only ways out — the mocks carry no ×, the
  // dock just folds back into the tile. Except mid-run, where the batch must
  // stay visible (stopping is its own control).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !running) reset()
    }
    const onDown = (e: MouseEvent) => {
      if (running) return
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) reset()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, running])

  // ── Single link ───────────────────────────────────────────────────────────
  const settleMessage = (message: string) => {
    setFlow({ kind: 'paste', busy: false, message })
    if (messageTimer.current) clearTimeout(messageTimer.current)
    messageTimer.current = setTimeout(() => {
      setFlow((f) => (f.kind === 'paste' ? { kind: 'paste', busy: false, message: null } : f))
      inputRef.current?.focus({ preventScroll: true })
    }, MESSAGE_MS)
  }

  const submitOne = async (raw: string) => {
    if (flow.kind === 'paste' && flow.busy) return
    const url = parseOneUrl(raw)
    if (!url) {
      if (raw.trim()) settleMessage('That doesn’t look like a link')
      return
    }
    setFlow({ kind: 'paste', busy: true, message: null })
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.saved && body.id) {
        setValue('')
        onSaved?.()
        // Saved → the pill becomes the list-publish step (mock state F).
        setFlow({ kind: 'published', bulletId: body.id })
        setPickerOpen(false)
        if (preset) {
          // Born from Create New List: file it there straight away.
          setSelected(new Set([preset.id]))
          await supabase.from('list_bookmarks').insert({ list_id: preset.id, bookmark_id: body.id })
          onListsChanged?.()
        } else {
          setSelected(new Set())
        }
      } else if (res.ok && body.skipped) {
        setValue('')
        settleMessage('Already on your Bulletin')
      } else {
        settleMessage('That link didn’t go through')
      }
    } catch {
      settleMessage('That link didn’t go through')
    }
  }

  // Publishing a single saved bullet applies immediately on each toggle —
  // there is nothing else left to run.
  const toggleListForBullet = async (listId: string, bulletId: string) => {
    const next = new Set(selected)
    if (next.has(listId)) {
      next.delete(listId)
      await supabase.from('list_bookmarks').delete().eq('list_id', listId).eq('bookmark_id', bulletId)
    } else {
      next.add(listId)
      await supabase.from('list_bookmarks').insert({ list_id: listId, bookmark_id: bulletId })
    }
    setSelected(next)
    onListsChanged?.()
  }

  // ── Bulk ──────────────────────────────────────────────────────────────────
  const readFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const urls = extractUrls(String(reader.result || ''))
      setFlow({ kind: 'bulk', fileName: file.name, urls })
      setSelected(preset ? new Set([preset.id]) : new Set())
      setPickerOpen(false)
    }
    reader.readAsText(file)
  }

  const runBulk = async (fileName: string, urls: string[]) => {
    if (urls.length === 0) return
    cancelled.current = false
    setPickerOpen(false)
    setFlow({ kind: 'bulk-running', fileName, urls, done: 0 })
    const savedIds: string[] = []
    let saved = 0, skipped = 0, failed = 0
    for (let i = 0; i < urls.length; i++) {
      if (cancelled.current) break
      try {
        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urls[i] }),
        })
        const body = await res.json().catch(() => ({}))
        if (res.ok && body.saved) { saved++; if (body.id) savedIds.push(body.id) }
        else if (res.ok && body.skipped) skipped++
        else failed++
      } catch {
        failed++
      }
      setFlow({ kind: 'bulk-running', fileName, urls, done: i + 1 })
      if (i < urls.length - 1 && !cancelled.current) {
        await new Promise((r) => setTimeout(r, GAP_MS))
      }
    }
    // The staged list selections apply to everything the run saved — one
    // insert, after the batch, so a cancelled run still files what landed.
    if (savedIds.length > 0 && selected.size > 0) {
      const rows = savedIds.flatMap((bid) => [...selected].map((lid) => ({ list_id: lid, bookmark_id: bid })))
      await supabase.from('list_bookmarks').insert(rows)
      onListsChanged?.()
    }
    if (saved > 0) onSaved?.()
    setFlow({ kind: 'bulk-done', saved, skipped, failed })
  }

  const toggleStaged = (listId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(listId)) next.delete(listId)
      else next.add(listId)
      return next
    })
  }

  // ── New list ──────────────────────────────────────────────────────────────
  const submitName = async (raw: string) => {
    if (flow.kind !== 'name' || flow.busy || !onCreateList) return
    const name = raw.trim()
    if (!name) return
    setFlow({ kind: 'name', busy: true, message: null })
    let id: string | null = null
    try { id = await onCreateList(name) } catch { id = null }
    if (!id) {
      setFlow({ kind: 'name', busy: false, message: 'That list didn’t take' })
      if (messageTimer.current) clearTimeout(messageTimer.current)
      messageTimer.current = setTimeout(() => {
        setFlow((f) => (f.kind === 'name' ? { kind: 'name', busy: false, message: null } : f))
        inputRef.current?.focus({ preventScroll: true })
      }, MESSAGE_MS)
      return
    }
    setValue('')
    setPreset({ id, name })
    setSelected(new Set([id]))
    setPickerOpen(false)
    setFlow({ kind: 'created' })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="pointer-events-none fixed inset-x-0 z-40" style={{ bottom: FOOTER_CLEARANCE }}>
      <div className={`mx-auto flex ${widthClassName} justify-end`}>
        {!open ? (
          // Closed: the frosted + tile, unchanged.
          <button
            onClick={() => { setOpen(true); setFlow({ kind: 'menu' }) }}
            aria-label="Add a link"
            title="Add a link"
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-[18px] transition-transform duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.04] active:scale-[0.98] sm:h-16 sm:w-16 sm:rounded-[20px]"
            style={TILE_STYLE}
          >
            <PlusGlyph className="text-white" />
          </button>
        ) : (
          <div ref={rootRef} className="pointer-events-auto flex w-full flex-wrap items-end justify-end gap-[10px] sm:w-auto sm:flex-nowrap">
            {/* ── Create New List: the menu's first pill, and only there — once
                any flow starts, the column that replaces the menu carries its
                own doors. Full-width on phones (wraps onto its own line above
                the other two); a 200px pill beside them from sm up. ── */}
            {flow.kind === 'menu' && onCreateList && (
              <Pill onClick={startNewList} className="w-full sm:w-[200px]">
                <span className={PILL_LABEL}>Create New List</span>
                {/* An 8px ring — the picker's unfilled list mark: a list with
                    nothing in it yet. */}
                <span aria-hidden className="absolute right-5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border" style={{ borderColor: GLYPH }} />
              </Pill>
            )}
            {/* ── Left slot: Add Bullet → paste → Saved!/publish. During a
                bulk state the pill stays standing beside the stack (mocks
                B–D), just inert while a batch is running. ── */}
            {(flow.kind === 'bulk' || flow.kind === 'bulk-running' || flow.kind === 'bulk-done') && (
              <Pill
                onClick={() => { if (!running) { setFlow({ kind: 'paste', busy: false, message: null }); setPickerOpen(false) } }}
                className={`hidden sm:flex sm:w-[200px] ${running ? 'opacity-50' : ''}`}
              >
                <span className={PILL_LABEL}>Add Bullet +</span>
                <span aria-hidden className="absolute right-5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full" style={{ background: GLYPH }} />
              </Pill>
            )}
            {(flow.kind === 'menu' || flow.kind === 'paste' || flow.kind === 'published' || flow.kind === 'name' || flow.kind === 'created') && (
              <div className="flex min-w-0 flex-1 flex-col items-stretch sm:flex-none">
                {flow.kind === 'published' && (
                  <>
                    <Row top>
                      <span className={`${ROW_TEXT} min-w-0 truncate text-ink`}>
                        Saved!
                        {preset && <span className="text-black/30"> · in {preset.name}</span>}
                      </span>
                    </Row>
                    {pickerOpen && (
                      <ListPanel
                        lists={lists}
                        selected={selected}
                        onToggle={(id) => toggleListForBullet(id, flow.bulletId)}
                        onCreate={onCreateList}
                      />
                    )}
                  </>
                )}
                {/* The name step — the paste input's twin, asking for words
                    instead of a link. Enter creates; Escape folds the dock. */}
                {flow.kind === 'name' && (
                  <div className="relative h-[60px] w-full overflow-hidden rounded-[10px] sm:w-[300px]" style={FROST_STYLE}>
                    {flow.message ? (
                      <span className={`flex h-full items-center px-5 ${PILL_LABEL} text-black/60`}>
                        {flow.message}
                      </span>
                    ) : (
                      <input
                        ref={inputRef}
                        type="text"
                        value={value}
                        disabled={flow.busy}
                        placeholder="Name your list"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="done"
                        aria-label="Name the new list"
                        data-1p-ignore
                        data-lpignore="true"
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitName(value) }}
                        className={`h-full w-full bg-transparent px-5 font-serif text-[16px] tracking-[-0.02em] text-ink outline-none placeholder:text-black/40 sm:text-[14px] ${
                          flow.busy ? 'animate-pulse text-black/40' : ''
                        }`}
                      />
                    )}
                  </div>
                )}
                {/* Created: the shelf, then the two doors stacked beneath it.
                    Either one runs the ordinary flow with the new list
                    already picked; folding the dock here is fine too — the
                    list exists and its card is already in the grid. */}
                {flow.kind === 'created' && preset && (
                  <div className="flex w-full flex-col sm:w-[300px]">
                    <Row top>
                      <span className={`${ROW_TEXT} min-w-0 truncate text-ink`}>
                        Created<span className="text-black/30"> · {preset.name}</span>
                      </span>
                    </Row>
                    <StackedAction onClick={() => { setFlow({ kind: 'paste', busy: false, message: null }); setPickerOpen(false) }}>
                      <span className={PILL_LABEL}>Add Bullet +</span>
                      <span aria-hidden className="absolute right-5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full" style={{ background: GLYPH }} />
                    </StackedAction>
                    <StackedAction last onClick={() => fileRef.current?.click()}>
                      <span className={PILL_LABEL}>Bulk Import</span>
                      <span aria-hidden className="absolute right-5 top-1/2 flex -translate-y-1/2 items-center gap-[6px]">
                        {[0, 1, 2].map((i) => (
                          <span key={i} className="h-1 w-1 rounded-full" style={{ background: GLYPH }} />
                        ))}
                      </span>
                    </StackedAction>
                  </div>
                )}
                {flow.kind === 'menu' && (
                  <Pill onClick={() => setFlow({ kind: 'paste', busy: false, message: null })} className="w-full sm:w-[200px]">
                    <span className={PILL_LABEL}>Add Bullet +</span>
                    <span aria-hidden className="absolute right-5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full" style={{ background: GLYPH }} />
                  </Pill>
                )}
                {flow.kind === 'paste' && (
                  <div className="relative h-[60px] w-full overflow-hidden rounded-[10px] sm:w-[300px]" style={FROST_STYLE}>
                    {flow.message ? (
                      <span className={`flex h-full items-center px-5 ${PILL_LABEL} text-black/60`}>
                        {flow.message}
                      </span>
                    ) : (
                      <input
                        ref={inputRef}
                        type="url"
                        value={value}
                        disabled={flow.busy}
                        placeholder="Paste URL here"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        enterKeyHint="go"
                        aria-label="Paste a link to save"
                        data-1p-ignore
                        data-lpignore="true"
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submitOne(value) }}
                        // Paste-and-done: a valid link on the clipboard saves
                        // the moment it lands.
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData('text')
                          if (parseOneUrl(pasted)) {
                            e.preventDefault()
                            setValue(pasted.trim())
                            submitOne(pasted)
                          }
                        }}
                        // 16px on phones so iOS doesn't zoom-jump on focus.
                        className={`h-full w-full bg-transparent px-5 font-serif text-[16px] tracking-[-0.02em] text-ink outline-none placeholder:text-black/40 sm:text-[14px] ${
                          flow.busy ? 'animate-pulse text-black/40' : ''
                        }`}
                      />
                    )}
                  </div>
                )}
                {flow.kind === 'published' && (
                  <PublishPill
                    stacked
                    open={pickerOpen}
                    onToggle={() => setPickerOpen((p) => !p)}
                    className="w-full sm:w-[300px]"
                  />
                )}
              </div>
            )}

            {/* ── Right slot: Bulk Import → Uploaded/picker/publish. Absent
                while a list is being named or has just been created — the
                doors live inside that column until one is chosen. ── */}
            {flow.kind === 'name' || flow.kind === 'created' ? null : flow.kind === 'menu' || flow.kind === 'paste' || flow.kind === 'published' ? (
              <Pill
                onClick={() => fileRef.current?.click()}
                className="w-full min-w-0 flex-1 sm:w-[200px] sm:flex-none"
              >
                <span className={PILL_LABEL}>Bulk Import</span>
                {/* Three 4px dots on a 10px pitch (Figma: x 1256/1266/1276). */}
                <span aria-hidden className="absolute right-5 top-1/2 flex -translate-y-1/2 items-center gap-[6px]">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1 w-1 rounded-full" style={{ background: GLYPH }} />
                  ))}
                </span>
              </Pill>
            ) : (
              <div className="flex w-full min-w-0 flex-col items-stretch sm:w-[300px]">
                {flow.kind === 'bulk' && (
                  <>
                    <Row top>
                      <span className={`${ROW_TEXT} shrink-0 text-ink`}>
                        Uploaded
                        <span className="text-black/30"> · {flow.urls.length} link{flow.urls.length === 1 ? '' : 's'}</span>
                      </span>
                      {/* Filename at 30%, anchored to its END and fading out
                          at its start (Figma's Rectangle 5166: a white →
                          transparent gradient over the first ~100px). Export
                          names front-load the boring part; the tail is what
                          you recognise. */}
                      <span
                        className="relative h-4 min-w-0 flex-1 overflow-hidden"
                        // On the clipping box, not the text: the fade must sit
                        // at the visible left edge however far the name spills.
                        style={{
                          maskImage: 'linear-gradient(90deg, transparent 0, #000 104px)',
                          WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 104px)',
                        }}
                      >
                        <span className={`${ROW_TEXT} absolute right-0 top-0 whitespace-nowrap text-black/30`}>
                          {flow.fileName}
                        </span>
                      </span>
                    </Row>
                    {pickerOpen && (
                      <ListPanel lists={lists} selected={selected} onToggle={toggleStaged} onCreate={onCreateList} />
                    )}
                    <PublishPill
                      stacked
                      open={pickerOpen}
                      onToggle={() => setPickerOpen((p) => !p)}
                      onPublish={flow.urls.length > 0 ? () => runBulk(flow.fileName, flow.urls) : undefined}
                      selectedCount={selected.size}
                      label={flow.urls.length === 0 ? 'No links in that file' : undefined}
                    />
                  </>
                )}
                {flow.kind === 'bulk-running' && (
                  <>
                    <Row top>
                      <span className={`${ROW_TEXT} shrink-0 text-ink`}>Saving</span>
                      <button onClick={() => { cancelled.current = true }} className={`${ROW_TEXT} text-black/30 transition-colors hover:text-ink`}>
                        stop here
                      </button>
                    </Row>
                    <div className="flex h-[60px] items-center rounded-b-[10px] px-5" style={STACKED_STYLE}>
                      <span className={`${PILL_LABEL} animate-pulse`}>
                        {flow.done} of {flow.urls.length}…
                      </span>
                    </div>
                  </>
                )}
                {flow.kind === 'bulk-done' && (
                  <>
                    <Row top>
                      <span className={`${ROW_TEXT} text-ink`}>
                        {flow.saved > 0 ? 'Saved!' : flow.failed > 0 ? 'Those didn’t go through' : 'Nothing new to add'}
                      </span>
                    </Row>
                    <button onClick={reset} className="flex h-[60px] items-center justify-between rounded-b-[10px] px-5 text-left" style={STACKED_STYLE}>
                      <span className={PILL_LABEL}>
                        {flow.saved} saved
                        {flow.skipped > 0 && ` · ${flow.skipped} already there`}
                        {flow.failed > 0 && ` · ${flow.failed} failed`}
                      </span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {/* The hidden CSV input, shared by every Bulk Import entry. */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.tsv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) readFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// A 60px frosted pill (radius 10): label left at the 20px inset (Figma's
// `calc(50% - w/2 + 281px)` resolves to x=910 on a pill at 890 — inset, not
// centred), ornament glyph 20px from the right edge, on the pill's midline.
function Pill({
  children,
  onClick,
  className = '',
}: {
  children: React.ReactNode
  onClick: () => void
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex h-[60px] items-center justify-start rounded-[10px] px-5 text-left transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] ${className}`}
      style={FROST_STYLE}
    >
      {children}
    </button>
  )
}

// The "Publish to these lists ⌄" pill — the anchor row of both flows. The
// FIRST click anywhere on it opens the picker: the words say "these lists",
// so clicking them must show the lists, never fire the run (that trap shipped
// once — a CSV went straight to saving with nothing picked). In bulk, the
// second click, with the picker open, is the deliberate publish; the label
// changes to say exactly what it will do.
function PublishPill({
  open,
  onToggle,
  onPublish,
  selectedCount = 0,
  label,
  stacked,
  className = '',
}: {
  open: boolean
  onToggle: () => void
  onPublish?: () => void
  selectedCount?: number
  label?: string
  stacked?: boolean
  className?: string
}) {
  const armed = open && !!onPublish
  const text =
    label ??
    (armed
      ? selectedCount > 0
        ? `Publish to ${selectedCount} list${selectedCount === 1 ? '' : 's'} →`
        : 'Publish without a list →'
      : 'Publish to these lists')
  return (
    <div
      className={`relative flex h-[60px] items-center ${stacked ? 'rounded-b-[10px]' : 'rounded-[10px]'} ${className}`}
      style={stacked ? STACKED_STYLE : FROST_STYLE}
    >
      <button
        onClick={armed ? onPublish : onToggle}
        disabled={!onPublish && !!label}
        className={`h-full min-w-0 flex-1 truncate px-5 text-left ${PILL_LABEL}`}
      >
        {text}
      </button>
      <button
        onClick={onToggle}
        aria-label={open ? 'Hide lists' : 'Choose lists'}
        className="flex h-full w-12 shrink-0 items-center justify-center"
      >
        <svg
          width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden
          className={`transition-transform duration-200 ${open ? '' : 'rotate-180'}`}
        >
          <path d="M5 12.5 10 7.5l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-ink/60" />
        </svg>
      </button>
    </div>
  )
}

// A 60px action row under a shelf: the stacked pill's opaque plate, squared
// where it meets its neighbours, rounded only at the stack's foot, with a
// hairline between siblings so two plates read as two rows.
function StackedAction({
  children,
  onClick,
  last,
}: {
  children: React.ReactNode
  onClick: () => void
  last?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex h-[60px] items-center justify-start px-5 text-left ${
        last ? 'rounded-b-[10px] border-t border-black/[0.06]' : ''
      }`}
      style={STACKED_STYLE}
    >
      {children}
    </button>
  )
}

// A solid-white 60px row (the Uploaded / Saved! shelf above a pill).
function Row({ top, children }: { top?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex h-[60px] items-center justify-between gap-3 border border-[#E0E0E0] bg-white px-5 ${
        top ? 'rounded-t-[10px] border-b-0' : ''
      }`}
    >
      {children}
    </div>
  )
}

// The list picker — white panel, one row per list, 18px ring on the right
// (filled dot = selected). Multi-select; capped and scrollable past ~4 rows.
// With `onCreate`, a "+ New list" row at the foot mints one in place (the
// extension's picker does the same) and hands its id back through onToggle,
// so it lands selected in whichever flow opened the panel.
function ListPanel({
  lists,
  selected,
  onToggle,
  onCreate,
}: {
  lists: { id: string; name: string }[]
  selected: Set<string>
  onToggle: (id: string) => void
  onCreate?: (name: string) => Promise<string | null>
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const clean = name.trim()
    if (!clean || !onCreate || busy) return
    setBusy(true)
    let id: string | null = null
    try { id = await onCreate(clean) } catch { id = null }
    setBusy(false)
    if (!id) return
    setName('')
    setCreating(false)
    onToggle(id)
  }
  return (
    <div className="max-h-[174px] overflow-y-auto border-x border-[#E0E0E0] bg-white">
      {lists.length === 0 && !onCreate ? (
        <p className={`px-5 py-4 font-sans text-[12px] font-[400] leading-4 tracking-[0.05em] text-black/30`}>
          No lists yet
        </p>
      ) : (
        lists.map((l) => {
          const on = selected.has(l.id)
          return (
            <button
              key={l.id}
              onClick={() => onToggle(l.id)}
              className="flex w-full items-center justify-between px-5 py-[13px] text-left transition-colors hover:bg-black/[0.02]"
            >
              <span className="min-w-0 truncate font-sans text-[12px] font-[400] leading-4 tracking-[0.05em] text-ink">
                {l.name}
              </span>
              <span
                aria-hidden
                className="relative ml-3 block h-[18px] w-[18px] shrink-0 rounded-full border border-black/25"
              >
                {on && (
                  <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
                )}
              </span>
            </button>
          )
        })
      )}
      {onCreate && (
        creating ? (
          <div className={`flex items-center px-5 py-[13px] ${lists.length > 0 ? 'border-t border-black/[0.06]' : ''}`}>
            <input
              autoFocus
              value={name}
              disabled={busy}
              placeholder="New list name"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              aria-label="Name the new list"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                // Escape backs out of the row, not the dock.
                else if (e.key === 'Escape') { e.stopPropagation(); setCreating(false); setName('') }
              }}
              className={`${ROW_TEXT} w-full bg-transparent text-ink outline-none placeholder:text-black/30 ${busy ? 'animate-pulse text-black/40' : ''}`}
            />
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className={`flex w-full items-center px-5 py-[13px] text-left transition-colors hover:bg-black/[0.02] ${lists.length > 0 ? 'border-t border-black/[0.06]' : ''}`}
          >
            <span className={`${ROW_TEXT} text-black/40`}>+ New list</span>
          </button>
        )
      )}
    </div>
  )
}

// The plus as two bars rather than a glyph — the stroke stays exactly 2px and
// the arms stay equal at any size. currentColor serves both plus and ×.
function PlusGlyph({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`relative block h-4 w-4 transition-transform duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${className}`}>
      <span className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 rounded-full bg-current" />
      <span className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 rounded-full bg-current" />
    </span>
  )
}
