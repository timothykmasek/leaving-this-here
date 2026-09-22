'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// The owner's persistent "add a link" dock — a frosted + tile bottom-right
// that expands into TWO pills (Figma 1137:297120): "Add Bullet +" (paste one
// link) and "Bulk Import +" (upload a CSV). Everything is anchored to the
// bottom-right and grows up/left; the pill row never moves, extra rows stack
// on top of it.
//
//   Add Bullet +  →  [ Paste URL here | ]      →  [ Saved! ]
//                                                  [ Publish to these lists ⌄ ]
//   Bulk Import + →  file dialog (Upload CSV)  →  [ Uploaded · file.csv ]
//                                                  [ (list picker panel) ]
//                                                  [ Publish to these lists ⌄ ]
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

export function ImportFab({
  widthClassName = 'max-w-[1720px] px-4 sm:px-10',
  // The owner's lists, for the "Publish to these lists" picker.
  lists = [],
  // Called after links land, so the feed refreshes without a reload.
  onSaved,
  // Called after list membership changes, so list counts refresh.
  onListsChanged,
}: {
  widthClassName?: string
  lists?: { id: string; name: string }[]
  onSaved?: () => void
  onListsChanged?: () => void
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [flow, setFlow] = useState<Flow>({ kind: 'menu' })
  const [value, setValue] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelled = useRef(false)
  const running = flow.kind === 'bulk-running'

  useEffect(() => {
    if (open && flow.kind === 'paste') inputRef.current?.focus({ preventScroll: true })
  }, [open, flow.kind])

  useEffect(() => () => { if (messageTimer.current) clearTimeout(messageTimer.current) }, [])

  const reset = () => {
    setOpen(false)
    setFlow({ kind: 'menu' })
    setValue('')
    setPickerOpen(false)
    setSelected(new Set())
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
        setSelected(new Set())
        setPickerOpen(false)
      } else if (res.ok && body.skipped) {
        setValue('')
        settleMessage('Already on your bulletin')
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
      setSelected(new Set())
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
          <div ref={rootRef} className="pointer-events-auto flex w-full items-end justify-end gap-[10px] sm:w-auto">
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
            {(flow.kind === 'menu' || flow.kind === 'paste' || flow.kind === 'published') && (
              <div className="flex min-w-0 flex-1 flex-col items-stretch sm:flex-none">
                {flow.kind === 'published' && (
                  <>
                    <Row top>
                      <span className={`${ROW_TEXT} text-ink`}>Saved!</span>
                    </Row>
                    {pickerOpen && (
                      <ListPanel
                        lists={lists}
                        selected={selected}
                        onToggle={(id) => toggleListForBullet(id, flow.bulletId)}
                      />
                    )}
                  </>
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

            {/* ── Right slot: Bulk Import → Uploaded/picker/publish ── */}
            {flow.kind === 'menu' || flow.kind === 'paste' || flow.kind === 'published' ? (
              <Pill
                onClick={() => fileRef.current?.click()}
                className="w-full min-w-0 flex-1 sm:w-[200px] sm:flex-none"
              >
                <span className={PILL_LABEL}>Bulk Import +</span>
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
                      <span className={`${ROW_TEXT} shrink-0 text-ink`}>Uploaded</span>
                      <span className={`${ROW_TEXT} min-w-0 truncate text-right text-black/30`}>
                        {flow.urls.length} link{flow.urls.length === 1 ? '' : 's'} · {flow.fileName}
                      </span>
                    </Row>
                    {pickerOpen && (
                      <ListPanel lists={lists} selected={selected} onToggle={toggleStaged} />
                    )}
                    <PublishPill
                      stacked
                      open={pickerOpen}
                      onToggle={() => setPickerOpen((p) => !p)}
                      onPublish={flow.urls.length > 0 ? () => runBulk(flow.fileName, flow.urls) : undefined}
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
                    <div className="flex h-[60px] items-center rounded-b-[10px] px-5" style={FROST_STYLE}>
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
                    <button onClick={reset} className="flex h-[60px] items-center justify-between rounded-b-[10px] px-5 text-left" style={FROST_STYLE}>
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
// chevron toggles the picker; in bulk it is also the run trigger.
function PublishPill({
  open,
  onToggle,
  onPublish,
  label,
  stacked,
  className = '',
}: {
  open: boolean
  onToggle: () => void
  onPublish?: () => void
  label?: string
  stacked?: boolean
  className?: string
}) {
  return (
    <div
      className={`relative flex h-[60px] items-center ${stacked ? 'rounded-b-[10px]' : 'rounded-[10px]'} ${className}`}
      style={FROST_STYLE}
    >
      <button
        onClick={onPublish ?? onToggle}
        disabled={!onPublish && !!label}
        className={`h-full min-w-0 flex-1 truncate px-5 text-left ${PILL_LABEL}`}
      >
        {label ?? 'Publish to these lists'}
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
function ListPanel({
  lists,
  selected,
  onToggle,
}: {
  lists: { id: string; name: string }[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div className="max-h-[174px] overflow-y-auto border-x border-[#E0E0E0] bg-white">
      {lists.length === 0 ? (
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
