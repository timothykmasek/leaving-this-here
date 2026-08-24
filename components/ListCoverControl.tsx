'use client'

// Owner affordance for a list's cover photo: add, replace, or remove.
//
// "Remove" is a first-class action, not a reset — Tim's call that a list should
// be able to CHOOSE to have no cover. So the no-cover masthead is a design
// state a user can deliberately land on, and this control always offers the way
// back to it.
//
// The file is downscaled and webp-encoded in the browser before it's sent
// (lib/imageResize). Images serve direct from Supabase with no optimizer, so
// the bytes chosen here are the bytes every visitor downloads.

import { useRef, useState } from 'react'
import { resizeImageToWebp } from '@/lib/imageResize'

const PILL =
  'rounded-full px-4 py-2 font-sans text-[12px] leading-4 tracking-[0.05em] transition-colors disabled:opacity-50'

export function ListCoverControl({
  listId,
  hasCover,
  onChange,
}: {
  listId: string
  hasCover: boolean
  /** Called with the new public URL, or null once the cover is removed. */
  onChange: (url: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File) => {
    setError(null)
    setBusy('upload')
    try {
      const { blob } = await resizeImageToWebp(file)
      const res = await fetch(`/api/lists/${listId}/cover`, {
        method: 'POST',
        headers: { 'content-type': 'image/webp' },
        body: blob,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'upload failed')
      onChange(json.url)
    } catch (err: any) {
      setError(err?.message || 'could not set that cover')
    } finally {
      setBusy(null)
      // Clear the input so re-picking the SAME file still fires onChange.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    setError(null)
    setBusy('remove')
    try {
      const res = await fetch(`/api/lists/${listId}/cover`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'could not remove the cover')
      }
      onChange(null)
    } catch (err: any) {
      setError(err?.message || 'could not remove the cover')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          className={
            hasCover
              ? `${PILL} border-none bg-white/90 text-black/70 backdrop-blur-[6px] hover:text-ink`
              : `${PILL} border border-dashed border-black/15 bg-transparent text-black/50 hover:border-black/40 hover:text-ink`
          }
        >
          {busy === 'upload' ? 'Uploading…' : hasCover ? 'Replace cover' : '+ Add cover photo'}
        </button>

        {hasCover && (
          <button
            onClick={handleRemove}
            disabled={busy !== null}
            className={`${PILL} border-none bg-white/90 text-black/50 backdrop-blur-[6px] hover:text-ink`}
          >
            {busy === 'remove' ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>

      {error && (
        <p className="max-w-[240px] text-right font-sans text-[12px] leading-4 text-[#a31f34]">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />
    </div>
  )
}
