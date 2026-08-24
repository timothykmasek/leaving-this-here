'use client'

// Owner affordance for a list's cover photo: choose one from the list's own
// bullets, upload your own, or remove it.
//
// The picker exists because uploading is a real chore and most lists already
// contain a better image than their owner will bother to find. Ranking uses
// lib/imageLightness, which was built for a different question (does a card
// bleed into the page?) but happens to be a tuned photo-vs-screenshot
// discriminator: its own notes measure a website screenshot at ~0.97 edge
// lightness, a product shot at ~0.93 and a photo at ~0.5 or below. Sorting
// ascending therefore floats photography and sinks screenshots of web pages —
// which are the worst possible covers, since cropping a page to 2.47:1 gets you
// a nav bar.
//
// "Remove" is a first-class action, not a reset: Tim's call that a list can
// CHOOSE to have no cover, so the no-cover masthead is a state you can land on
// deliberately and this control always offers the way back to it.

import { useCallback, useEffect, useState } from 'react'
import { resizeImageToWebp } from '@/lib/imageResize'
import { sampleEdgeLightness } from '@/lib/imageLightness'

const PILL =
  'rounded-full px-4 py-2 font-sans text-[12px] leading-4 tracking-[0.05em] transition-colors disabled:opacity-50'

// A CORS-tainted image can't be sampled. Unknown isn't the same as bad, so it
// sorts between "photo" and "web page" rather than to the back.
const UNKNOWN_SCORE = 0.75

export function ListCoverControl({
  listId,
  hasCover,
  candidates = [],
  onChange,
}: {
  listId: string
  hasCover: boolean
  /** Images already on this list's bullets, offered as one-click covers. */
  candidates?: string[]
  /** Called with the new public URL, or null once the cover is removed. */
  onChange: (url: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [ranked, setRanked] = useState<string[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Rank on open, not on mount: this loads every candidate to sample it, and a
  // list page that nobody edits shouldn't pay for that.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setRanked(null)
    ;(async () => {
      const scored = await Promise.all(
        candidates.map(async (url) => ({
          url,
          score: (await sampleEdgeLightness(url)) ?? UNKNOWN_SCORE,
        }))
      )
      if (!cancelled) {
        scored.sort((a, b) => a.score - b.score)
        setRanked(scored.map((s) => s.url))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, candidates])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const send = useCallback(
    async (init: RequestInit, key: string) => {
      setError(null)
      setBusy(key)
      try {
        const res = await fetch(`/api/lists/${listId}/cover`, init)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'that did not work')
        onChange(json.url ?? null)
        setOpen(false)
      } catch (err: any) {
        setError(err?.message || 'that did not work')
      } finally {
        setBusy(null)
      }
    },
    [listId, onChange]
  )

  const chooseExisting = (url: string) =>
    send(
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceUrl: url }) },
      url
    )

  const uploadFile = async (file: File) => {
    setError(null)
    setBusy('upload')
    try {
      const { blob } = await resizeImageToWebp(file)
      await send({ method: 'POST', headers: { 'content-type': 'image/webp' }, body: blob }, 'upload')
    } catch (err: any) {
      setError(err?.message || 'could not read that image')
      setBusy(null)
    }
  }

  return (
    <>
      {/* An icon, sitting beside the list name next to the edit pencil. Both
          controls are one idea — "change this list" — so they read as a pair
          rather than as two worded buttons in two places. The label survives in
          aria-label/title, which is what a screen reader and a tooltip use. */}
      <button
        onClick={() => setOpen(true)}
        aria-label={hasCover ? 'Change cover photo' : 'Add a cover photo'}
        title={hasCover ? 'Change cover photo' : 'Add a cover photo'}
        className="inline-flex text-current transition-colors hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </button>

      {open && (
        // An overlay, not a dropdown: the cover is `overflow-hidden` to clip the
        // photo to its 20px radius, which would clip a panel anchored inside it.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal
            aria-label="Choose a cover"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full max-w-[560px] overflow-y-auto rounded-[20px] bg-paper p-6 text-left shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]"
          >
            <p className="font-sans text-[20px] font-[600] leading-6 text-ink">Choose a cover</p>
            <p className="mt-1 font-serif text-[14px] leading-[22px] tracking-[-0.01em] text-black/60">
              Pick one from this list, or use your own.
            </p>

            {candidates.length > 0 && (
              <div className="mt-5">
                {ranked === null ? (
                  <p className="label text-black/30">Sorting by what looks best…</p>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {ranked.map((url) => (
                      <button
                        key={url}
                        onClick={() => chooseExisting(url)}
                        disabled={busy !== null}
                        className="group relative aspect-[1184/480] overflow-hidden rounded-[10px] bg-card ring-1 ring-black/[0.06] transition-shadow hover:ring-black/30 disabled:opacity-50"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        {busy === url && (
                          <span className="absolute inset-0 flex items-center justify-center bg-white/70 label text-ink">
                            Saving…
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-black/[0.06] pt-5">
              <label className={`${PILL} cursor-pointer border border-black/15 text-black/70 hover:border-black/40 hover:text-ink`}>
                {busy === 'upload' ? 'Uploading…' : 'Upload your own'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={busy !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadFile(f)
                    e.target.value = ''
                  }}
                />
              </label>

              {hasCover && (
                <button
                  onClick={() => send({ method: 'DELETE' }, 'remove')}
                  disabled={busy !== null}
                  className={`${PILL} border-none bg-transparent text-black/50 hover:text-ink`}
                >
                  {busy === 'remove' ? 'Removing…' : 'Remove cover'}
                </button>
              )}

              <button
                onClick={() => setOpen(false)}
                className={`${PILL} ml-auto border-none bg-transparent text-black/40 hover:text-ink`}
              >
                Cancel
              </button>
            </div>

            {error && (
              <p className="mt-3 font-sans text-[12px] leading-4 text-[#a31f34]">{error}</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
