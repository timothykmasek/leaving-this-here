'use client'

import { useState, useEffect, useRef } from 'react'
import { GemGlyph } from '@/components/GemGlyph'
import { resizeImageToWebp } from '@/lib/imageResize'
import { withBulletinUtm } from '@/lib/outboundUrl'
import { formatCardTitle } from '@/lib/cardTitle'

// Detail view for a single bullet, per the ProjectX "Edit Bullet" frame: a
// white panel over a grey scrim, image floating on the left inside fixed
// insets (60 top, 40 sides), and the right pane leading with list membership.
// Member rows shed with a ✕, other lists join on click, and the black row is a
// typeahead — matching lists surface under it as "Add to this List", enter
// creates a new one. The link-out chip anchors to the pane's bottom-left
// corner regardless of image size; pin/delete live as small underlined links
// in the foot with the saved-date tucked opposite. Rendered as an overlay;
// closes on backdrop click or Escape. Editing flows through the same handlers
// the profile page uses, so changes persist and the grid stays in sync.

interface Bullet {
  id: string
  /** The owner's own picture, if they've set one (raw_metadata.customImage). */
  customImage?: string | null
  title: string | null
  description: string | null
  url: string
  image_url: string | null
  screenshot_url: string | null
  favicon_url: string | null
  note: string | null
  created_at: string | null
  /** Set = pinned to the top of the profile (migration 025). */
  pinned_at?: string | null
}

interface List {
  id: string
  name: string
  bookmark_ids: string[]
}

interface BulletDetailProps {
  bullet: Bullet
  lists?: List[]
  onClose: () => void
  onNoteUpdate: (id: string, note: string | null) => void
  onDelete: (id: string) => void
  onToggleListMembership?: (listId: string, bookmarkId: string, add: boolean) => void
  onCreateList?: (name: string, bookmarkIds?: string[]) => Promise<string | null>
  onTogglePin?: (id: string, pin: boolean) => void
  /** Persist a hand-edited title. Absent → the title is not clickable. */
  onTitleUpdate?: (id: string, title: string) => void
  // utm_campaign for the visit link's click-out attribution (curator username).
  utmCampaign?: string | null
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

// One list row: 48px, hairline border, 12px Mier with the +5% tracking the
// design's small type carries everywhere. Member rows read at full weight;
// rows the bullet is NOT in sit back — grey text, lighter border — so the
// ✕/+ contrast isn't the only thing separating "saved in" from "could be".
const rowBase =
  'flex h-12 w-full shrink-0 items-center justify-between gap-3 rounded-[9px] border bg-white px-[15px] text-xs font-medium tracking-[0.05em]'
const rowClass = `${rowBase} border-[#E0E0E0] text-black`
const rowQuiet = `${rowBase} border-[#EAEAEA] text-black/50 transition-colors hover:border-black/40 hover:text-black`

export function BulletDetail({
  bullet,
  lists = [],
  onClose,
  onNoteUpdate,
  onDelete,
  onToggleListMembership,
  onCreateList,
  onTogglePin,
  onTitleUpdate,
  utmCampaign,
}: BulletDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [imgError, setImgError] = useState(false)
  // Wide images float mid-well; tall and square ones anchor to its top. Only
  // the loaded image knows which it is, so this lands onLoad.
  const [landscape, setLandscape] = useState(false)
  // Whether the list well has rows hiding below the fold. Drives the foot-fade
  // that replaced the scrollbar — the fade IS the scroll indicator.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [moreBelow, setMoreBelow] = useState(false)
  // The owner's own picture. Held locally so the preview updates the moment it
  // uploads, rather than waiting for the page's data to come round again.
  const [custom, setCustom] = useState<string | null>(bullet.customImage ?? null)
  const [imgBusy, setImgBusy] = useState<'upload' | 'reset' | null>(null)
  const [imgMsg, setImgMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [newListName, setNewListName] = useState('')
  // Title editing. The override sticks locally after a save so the heading
  // updates instantly, without waiting for the parent's data to come round.
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [titleOverride, setTitleOverride] = useState<string | null>(null)
  // Names typed and sent, not yet confirmed. Pressing enter used to await the
  // whole round trip before so much as clearing the input, so the text just sat
  // there and nothing moved — no way to tell if it had worked, or whether to
  // press it again.
  const [pendingLists, setPendingLists] = useState<string[]>([])
  // A name stops counting as pending the instant the real list appears in
  // `lists`, so the placeholder and the finished row never overlap for a frame
  // in the window between the parent's state landing and the await resolving.
  const pendingNames = pendingLists.filter((n) => !lists.some((l) => l.name === n))

  const domain = getDomain(bullet.url)
  const outbound = withBulletinUtm(bullet.url, utmCampaign)
  // Same `Brand — what it is` normalization the card renders, so the modal
  // never shows a rawer title than the card that opened it.
  const displayTitle =
    titleOverride ??
    formatCardTitle({ title: bullet.title, description: bullet.description, url: bullet.url })
  // The owner's picture wins here for the same reason it wins on the card.
  const preview = (!imgError && (custom || bullet.screenshot_url || bullet.image_url)) || null

  // Member lists lead, other lists trail as click-to-add rows.
  const memberLists = lists.filter((l) => l.bookmark_ids.includes(bullet.id))
  const otherLists = lists.filter((l) => !l.bookmark_ids.includes(bullet.id))
  // Typeahead under the black row: lists whose name matches what's being
  // typed, offered as "Add to this List" before creating a duplicate.
  const query = newListName.trim().toLowerCase()
  const matches = query
    ? otherLists.filter((l) => l.name.toLowerCase().includes(query)).slice(0, 2)
    : []

  const uploadImage = async (file: File) => {
    setImgMsg(null)
    setImgBusy('upload')
    try {
      const { blob } = await resizeImageToWebp(file)
      const res = await fetch(`/api/bookmarks/${bullet.id}/image`, {
        method: 'POST',
        headers: { 'content-type': 'image/webp' },
        body: blob,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'could not save that image')
      setCustom(json.url)
      setImgError(false)
    } catch (err: any) {
      setImgMsg(err?.message || 'could not read that image')
    } finally {
      setImgBusy(null)
      // Clear the input so re-picking the SAME file still fires onChange.
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const resetImage = async () => {
    setImgMsg(null)
    setImgBusy('reset')
    try {
      const res = await fetch(`/api/bookmarks/${bullet.id}/image`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'could not undo that')
      }
      setCustom(null)
      setImgError(false)
    } catch (err: any) {
      setImgMsg(err?.message || 'could not undo that')
    } finally {
      setImgBusy(null)
    }
  }

  const createList = async () => {
    const name = newListName.trim()
    if (!name || !onCreateList) return
    // Clear and show the pending row BEFORE awaiting, so the press has a
    // visible consequence immediately.
    setNewListName('')
    setPendingLists((p) => [...p, name])
    try {
      // A null id means the create failed. Hand the typing back rather than
      // swallowing it — retyping a list name because the network blipped is
      // worse than seeing it reappear.
      const id = await onCreateList(name, [bullet.id])
      if (!id) setNewListName(name)
    } catch {
      setNewListName(name)
    } finally {
      setPendingLists((p) => p.filter((n) => n !== name))
    }
  }

  const saveTitle = () => {
    setEditingTitle(false)
    const clean = titleDraft.trim()
    if (!clean || clean === displayTitle || !onTitleUpdate) return
    setTitleOverride(clean)
    onTitleUpdate(bullet.id, clean)
  }

  const updateScrollHint = () => {
    const el = scrollRef.current
    if (!el) return
    setMoreBelow(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }

  // Rows come and go (adds, removes, pending creates) — re-measure whether
  // anything still hides below the fold.
  useEffect(updateScrollHint, [lists, pendingLists, newListName]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset local state when switching to a different bullet.
  useEffect(() => {
    setConfirmingDelete(false)
    setImgError(false)
    setLandscape(false)
    setCustom(bullet.customImage ?? null)
    setImgMsg(null)
    setEditingTitle(false)
    setTitleOverride(null)
  }, [bullet.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes; lock body scroll while open. Escape from inside an input
  // (title edit, the new-list row) belongs to that input — it cancels the
  // edit, not the whole modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#C6C6C6]/60 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[88vh] w-full max-w-[1048px] flex-col overflow-hidden rounded-[20px] border border-[#E7E7E7] bg-white md:h-[672px] md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left — the image floating on white inside fixed insets: 60 top, 40
            sides, with the chip zone reserved below. The panel is the constant;
            the image takes its natural aspect inside it — full width, height by
            aspect, capped and cropped only when taller than the well. */}
        <div className="relative w-full md:w-1/2">
          {/* Tall and square images anchor to the well's top-left; a wide
              landscape one would leave a lonely band up there, so it centers
              vertically instead. */}
          <div
            className={`flex justify-start px-10 pt-[60px] pb-[90px] md:absolute md:inset-x-10 md:top-[60px] md:bottom-[90px] md:p-0 ${
              landscape ? 'items-center' : 'items-start'
            }`}
          >
            <div className="group relative w-full max-h-full overflow-hidden rounded-[20px] bg-[#F1F1F1]">
              {preview ? (
                <img
                  src={preview}
                  alt={displayTitle}
                  className="max-h-[456px] w-full object-cover md:max-h-[522px]"
                  onLoad={(e) => setLandscape(e.currentTarget.naturalWidth > e.currentTarget.naturalHeight)}
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex aspect-[4/3] w-full items-center justify-center">
                  <GemGlyph className="h-12 w-12 text-black/20" />
                </div>
              )}
              {/* Foot-fade into the panel white. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-white/0 to-white" />

              {/* Use your own picture — revealed on hover over the image. The
                  card's image is normally chosen for it (og:image or
                  screenshot) and this is the escape hatch for when both are
                  wrong: a Maps link whose capture is Google's bot wall, a shop
                  whose og is a bare wordmark. */}
              <div className="absolute bottom-4 right-4 flex items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                {custom && (
                  <button
                    onClick={resetImage}
                    disabled={imgBusy !== null}
                    className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium tracking-[0.05em] text-black/60 transition-colors hover:text-black disabled:opacity-50"
                  >
                    {imgBusy === 'reset' ? 'Undoing…' : 'Use original'}
                  </button>
                )}
                <label
                  title={custom ? 'Replace image' : 'Use your own image'}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/90 text-black/70 shadow-sm transition-colors hover:text-black"
                >
                  {imgBusy === 'upload' ? (
                    <span className="h-3 w-3 animate-pulse rounded-full bg-black/40" aria-hidden />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-4.5-4.5L5 22" />
                    </svg>
                  )}
                  <span className="sr-only">{custom ? 'Replace image' : 'Use your own image'}</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={imgBusy !== null}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadImage(f)
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Link out — the black chip lives at the pane's bottom-left corner,
              fixed there whatever size the image runs. Hover unfolds the
              domain out of the pill. */}
          <a
            href={outbound}
            target="_blank"
            rel="noopener"
            aria-label={`visit ${domain}`}
            className="group/chip absolute bottom-[30px] left-[30px] flex h-[30px] min-w-[33px] items-center justify-center gap-1 rounded-[10px] bg-black px-2 text-white transition-all"
          >
            <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-medium tracking-[0.05em] transition-[max-width] duration-200 group-hover/chip:max-w-[220px] group-hover/chip:pl-1">
              {domain}
            </span>
            {/* The glyph's ink sits above the baseline while its box reserves
                descender space below — dead-center box = optically high arrow.
                The nudge re-centers the ink, not the box. */}
            <span aria-hidden className="translate-y-[2px] text-sm leading-none">↗</span>
          </a>

          {imgMsg && (
            <p className="absolute bottom-[30px] left-[75px] max-w-[280px] rounded-md bg-white/95 px-2 py-1 text-xs text-[#a31f34]">
              {imgMsg}
            </p>
          )}
        </div>

        {/* Right — title, then lists as the main event. Hairline divider
            between the panes. */}
        <div className="flex min-h-0 w-full flex-col border-t border-[#EDEDED] p-6 md:w-1/2 md:border-l md:border-t-0 md:p-10 md:pt-[60px]">
          <div className="flex items-start justify-between gap-6">
            {editingTitle ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle()
                  if (e.key === 'Escape') setEditingTitle(false)
                }}
                autoFocus
                className="w-full bg-transparent font-sans text-xl font-semibold leading-6 text-black focus:outline-none"
              />
            ) : (
              <h2
                onClick={
                  onTitleUpdate
                    ? () => {
                        setTitleDraft(displayTitle)
                        setEditingTitle(true)
                      }
                    : undefined
                }
                title={onTitleUpdate ? 'Click to edit' : undefined}
                className={`font-sans text-xl font-semibold leading-6 text-black ${
                  onTitleUpdate ? 'cursor-text decoration-black/20 hover:underline hover:underline-offset-4' : ''
                }`}
              >
                {displayTitle}
              </h2>
            )}
            <button
              onClick={onClose}
              aria-label="close"
              className="text-xs font-medium tracking-[0.05em] text-black transition-opacity hover:opacity-50"
            >
              ✕
            </button>
          </div>
          <a
            href={outbound}
            target="_blank"
            rel="noopener"
            className="mt-2.5 self-start text-xs font-medium tracking-[0.05em] text-black hover:underline"
          >
            {domain} <span aria-hidden>→</span>
          </a>

          {/* Lists */}
          {onToggleListMembership && (
            <div className="mt-auto flex min-h-0 flex-col pt-8">
              {/* The header only claims what's true: no memberships yet means
                  there's nothing this is "saved in". */}
              <p className="mb-3 text-xs font-medium tracking-[0.05em] text-black">
                {memberLists.length + pendingNames.length > 0
                  ? 'Saved in these lists:'
                  : 'Add to a list:'}
              </p>
              {/* Past three rows this scrolls. No scrollbar — the foot-fade
                  over the last visible row is the "more below" signal, and it
                  lifts once the well is scrolled to its end. */}
              <div className="relative min-h-0">
                <div
                  ref={scrollRef}
                  onScroll={updateScrollHint}
                  className="flex max-h-[164px] flex-col gap-2.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  aria-live="polite"
                >
                  {memberLists.map((l) => (
                    <div key={l.id} className={rowClass}>
                      <span className="truncate">{l.name}</span>
                      <button
                        onClick={() => onToggleListMembership(l.id, bullet.id, false)}
                        aria-label={`remove from ${l.name}`}
                        className="shrink-0 transition-opacity hover:opacity-50"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {/* The row you are about to get, in the slot it will occupy,
                      greyed until the server agrees. Carries the name rather
                      than being blank — it confirms what was typed, which is
                      the actual question in the moment. */}
                  {pendingNames.map((name) => (
                    <div key={name} className={`${rowBase} animate-pulse border-black/10 text-black/40`}>
                      <span className="truncate">{name}</span>
                    </div>
                  ))}
                  {/* Lists this bullet isn't in yet, set back in grey with a +
                      (the ✕'s mirror), under their own whispered divider so
                      they never read as memberships. */}
                  {otherLists.length > 0 && memberLists.length + pendingNames.length > 0 && (
                    <p className="mt-1 text-xs font-medium tracking-[0.05em] text-black/35">
                      Add to another:
                    </p>
                  )}
                  {otherLists.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => onToggleListMembership(l.id, bullet.id, true)}
                      className={`${rowQuiet} text-left`}
                    >
                      <span className="truncate">{l.name}</span>
                      <span className="shrink-0 text-sm leading-none" aria-hidden>
                        +
                      </span>
                    </button>
                  ))}
                </div>
                {moreBelow && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-white/0 to-white" />
                )}
              </div>

              {/* New list — the black row is a typeahead: matching lists
                  surface below it as "Add to this List" before a duplicate
                  gets created; enter (or the button) makes a new one. */}
              {onCreateList && (
                <>
                  <div className="mt-2.5 flex h-12 w-full shrink-0 items-center justify-between gap-2.5 rounded-[9px] bg-black px-[15px]">
                    <input
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') createList()
                      }}
                      placeholder="Or, add to new list"
                      className="w-full bg-transparent text-xs font-medium tracking-[0.05em] text-white placeholder:text-white focus:outline-none"
                    />
                    <button
                      onClick={createList}
                      aria-label="create list"
                      className="shrink-0 whitespace-nowrap text-xs font-medium tracking-[0.05em] text-white transition-opacity hover:opacity-60"
                    >
                      {query ? (
                        <>
                          Create New List <span aria-hidden>→</span>
                        </>
                      ) : (
                        <span aria-hidden>→</span>
                      )}
                    </button>
                  </div>
                  {matches.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => {
                        onToggleListMembership?.(l.id, bullet.id, true)
                        setNewListName('')
                      }}
                      className={`${rowClass} mt-2.5 text-left transition-colors hover:border-black/40`}
                    >
                      <span className="truncate">{l.name}</span>
                      <span className="shrink-0 text-black/60">Add to this List</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Foot — pin and delete as quiet underlined links, the saved-date
              tucked opposite. */}
          <div className="flex items-center justify-between gap-4 pt-6 text-xs font-medium tracking-[0.05em] text-black">
            <span className="flex items-center gap-[30px]">
              {onTogglePin && (
                <button
                  onClick={() => onTogglePin(bullet.id, !bullet.pinned_at)}
                  className="underline underline-offset-2 transition-opacity hover:opacity-50"
                >
                  {bullet.pinned_at ? 'Unpin Bullet' : 'Pin Bullet'}
                </button>
              )}
              {confirmingDelete ? (
                <span className="flex items-center gap-2.5">
                  <span className="text-black/45">Delete this bullet?</span>
                  <button
                    onClick={() => {
                      onDelete(bullet.id)
                      onClose()
                    }}
                    className="underline underline-offset-2 text-[#a31f34] transition-opacity hover:opacity-60"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirmingDelete(false)}
                    className="text-black/45 transition-opacity hover:opacity-60"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  className="underline underline-offset-2 transition-opacity hover:opacity-50"
                >
                  Delete Bullet
                </button>
              )}
            </span>
            {bullet.created_at && (
              <span className="shrink-0 font-normal text-black/30">
                Saved {timeAgo(bullet.created_at)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
