'use client'

import { useState, useEffect, useRef } from 'react'
import { GemGlyph } from '@/components/GemGlyph'
import { resizeImageToWebp } from '@/lib/imageResize'

// Mymind-style detail view for a single bullet. Two panes: a large preview on the
// left, and metadata on the right — lists and a delete action. Rendered as an
// overlay; closes on backdrop click or Escape. Editing flows through the same
// handlers the profile page uses, so changes persist and the grid stays in sync.

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

export function BulletDetail({
  bullet,
  lists = [],
  onClose,
  onNoteUpdate,
  onDelete,
  onToggleListMembership,
  onCreateList,
  onTogglePin,
}: BulletDetailProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [imgError, setImgError] = useState(false)
  // The owner's own picture. Held locally so the preview updates the moment it
  // uploads, rather than waiting for the page's data to come round again.
  const [custom, setCustom] = useState<string | null>(bullet.customImage ?? null)
  const [imgBusy, setImgBusy] = useState<'upload' | 'reset' | null>(null)
  const [imgMsg, setImgMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [newListName, setNewListName] = useState('')
  // Names typed and sent, not yet confirmed. Pressing enter used to await the
  // whole round trip before so much as clearing the input, so the text just sat
  // there and nothing moved — no way to tell if it had worked, or whether to
  // press it again.
  const [pendingLists, setPendingLists] = useState<string[]>([])
  // A name stops counting as pending the instant the real list appears in
  // `lists`, so the placeholder and the finished chip never overlap for a frame
  // in the window between the parent's state landing and the await resolving.
  const pendingNames = pendingLists.filter((n) => !lists.some((l) => l.name === n))

  const domain = getDomain(bullet.url)
  // The owner's picture wins here for the same reason it wins on the card.
  const preview = (!imgError && (custom || bullet.screenshot_url || bullet.image_url)) || null

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

  // Reset local state when switching to a different bullet.
  useEffect(() => {
    setConfirmingDelete(false)
    setImgError(false)
    setCustom(bullet.customImage ?? null)
    setImgMsg(null)
  }, [bullet.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-5xl max-h-[88vh] flex-col overflow-hidden rounded-xl border border-black/10 bg-paper shadow-2xl md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-paper/80 text-black/45 hover:text-ink hover:bg-paper transition-colors"
        >
          ✕
        </button>

        {/* Left — preview */}
        <div className="relative flex w-full items-center justify-center bg-card md:w-[58%]">
          {preview ? (
            <img
              src={preview}
              alt={bullet.title || domain}
              className="h-56 w-full object-cover md:h-full md:max-h-[88vh]"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-56 w-full items-center justify-center md:h-full">
              <GemGlyph className="h-12 w-12 text-ink/20" />
            </div>
          )}
          {/* Use your own picture. The card's image is normally chosen for it —
              og:image or screenshot — and this is the escape hatch for when both
              are wrong: a Maps link whose capture is Google's bot wall, a shop
              whose og is a bare wordmark. Sits opposite the visit pill so the
              two actions on this pane don't crowd each other. */}
          <div className="absolute bottom-4 right-4 flex items-center gap-2">
            {custom && (
              <button
                onClick={resetImage}
                disabled={imgBusy !== null}
                className="rounded-full bg-paper/90 px-3 py-1.5 text-xs font-medium text-black/55 transition-colors hover:text-ink disabled:opacity-50"
              >
                {imgBusy === 'reset' ? 'Undoing…' : 'Use original'}
              </button>
            )}
            <label className="cursor-pointer rounded-full bg-paper/90 px-3 py-1.5 text-xs font-medium text-black/70 transition-colors hover:text-ink">
              {imgBusy === 'upload' ? 'Uploading…' : custom ? 'Replace image' : 'Use your own image'}
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

          {imgMsg && (
            <p className="absolute bottom-14 right-4 max-w-[240px] rounded-md bg-paper/95 px-2 py-1 text-right text-xs text-[#a31f34]">
              {imgMsg}
            </p>
          )}

          <a
            href={bullet.url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:bg-ink/85 transition-colors"
          >
            {bullet.favicon_url && (
              <img src={bullet.favicon_url} alt="" className="h-3.5 w-3.5 rounded-sm" />
            )}
            visit {domain}
            <span aria-hidden>↗</span>
          </a>
        </div>

        {/* Right — meta */}
        <div className="flex w-full flex-col overflow-y-auto p-6 md:w-[42%]">
          <h2 className="font-sans text-xl font-normal leading-snug tracking-tight text-ink">
            {bullet.title || domain}
          </h2>
          <p className="mt-1.5 text-xs uppercase tracking-[0.13em] text-black/45">
            {timeAgo(bullet.created_at)}
            {bullet.created_at && ' · '}
            {domain}
          </p>

          {/* Lists */}
          {onToggleListMembership && (
            <div className="mt-6">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-black/40">
                lists
              </p>
              {(lists.length > 0 || pendingNames.length > 0) && (
                <div className="flex flex-wrap gap-1.5" aria-live="polite">
                  {lists.map((l) => {
                    const inList = l.bookmark_ids.includes(bullet.id)
                    return (
                      <button
                        key={l.id}
                        onClick={() => onToggleListMembership(l.id, bullet.id, !inList)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
                          inList
                            ? 'bg-ink text-paper'
                            : 'border border-black/10 bg-white text-ink hover:border-ink/40'
                        }`}
                      >
                        {inList && <span aria-hidden>✓</span>}
                        {l.name}
                      </button>
                    )
                  })}
                  {/* The chip you are about to get, in the slot it will occupy,
                      greyed until the server agrees. Carries the name rather
                      than being a blank placeholder — it confirms what was
                      typed, which is the actual question in the moment. */}
                  {pendingNames.map((name) => (
                    <span
                      key={name}
                      className="inline-flex animate-pulse items-center gap-1 rounded-full border border-black/10 bg-black/[0.04] px-2.5 py-1 text-xs text-black/40"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {onCreateList && (
                <input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key !== 'Enter') return
                    const name = newListName.trim()
                    if (!name) return
                    // Clear and show the pending chip BEFORE awaiting, so the
                    // press has a visible consequence immediately.
                    setNewListName('')
                    setPendingLists((p) => [...p, name])
                    try {
                      // A null id means the create failed. Hand the typing back
                      // rather than swallowing it — retyping a list name because
                      // the network blipped is worse than seeing it reappear.
                      const id = await onCreateList(name, [bullet.id])
                      if (!id) setNewListName(name)
                    } catch {
                      setNewListName(name)
                    } finally {
                      setPendingLists((p) => p.filter((n) => n !== name))
                    }
                  }}
                  placeholder="+ new list (press enter)"
                  className="mt-2 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm focus:border-ink/50 focus:outline-none"
                />
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-auto flex items-center justify-between pt-6">
            {/* Pin to the top of the profile. The parent owns the state (the
                grid resorts optimistically), so this just reads bullet.pinned_at
                and asks for the opposite. */}
            {onTogglePin && (
              <button
                onClick={() => onTogglePin(bullet.id, !bullet.pinned_at)}
                className={`inline-flex items-center gap-1.5 text-sm transition-colors ${
                  bullet.pinned_at ? 'text-ink hover:text-black/45' : 'text-black/45 hover:text-ink'
                }`}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill={bullet.pinned_at ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M9 3h6l-1 7 3 2.5V15H7v-2.5L10 10 9 3z" />
                  <path d="M12 15v6" />
                </svg>
                {bullet.pinned_at ? 'pinned to top — unpin' : 'pin to top'}
              </button>
            )}
            {confirmingDelete ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-black/45">delete this bullet?</span>
                <button
                  onClick={() => {
                    onDelete(bullet.id)
                    onClose()
                  }}
                  className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                >
                  delete
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="text-xs text-black/45 hover:text-ink"
                >
                  cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex items-center gap-1.5 text-sm text-black/45 hover:text-red-600 transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
