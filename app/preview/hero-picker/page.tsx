// PREVIEW-ONLY: candidate picker for the depth hero's card field. Pulls the
// newest bookmarks with images, renders each in the hero's exact plate style
// AND its real plate shape — measured from the image's aspect and assigned
// one of the three v3 sizes (240×160 wide / 168×168 square / 200×280 tall) —
// and lets Tim click-select the ones worth flying. "Copy selection" puts a
// JSON array (with the assigned w/h) on the clipboard for folding into
// HERO_CARDS. Safe to delete.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cardImageCandidates } from '@/lib/cardImage'
import { formatCardTitle } from '@/lib/cardTitle'
import { captionMask } from '@/lib/homeContent'

const FETCH_LIMIT = 1000 // over-fetch: dedupe by domain + drop imageless rows
const SHOW_LIMIT = 300
const PER_DOMAIN = 3

// The hero's three plate shapes, chosen by the image's own aspect so the crop
// shows the image the way the hero would.
function plateFor(aspect: number): { w: number; h: number } {
  if (aspect >= 1.25) return { w: 240, h: 160 }
  if (aspect <= 0.85) return { w: 200, h: 280 }
  return { w: 168, h: 168 }
}

type Candidate = {
  id: string
  url: string
  caption: string
  image: string
}

export default function HeroPickerPreview() {
  const [rows, setRows] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  // An image that 404s/403s here would 404 in the hero too — drop the card
  // from the pool instead of showing a grey plate Tim can't judge.
  const [broken, setBroken] = useState<Set<string>>(new Set())
  // id → naturalWidth/naturalHeight, measured as each image loads. Until an
  // image reports, its card renders square and then settles into its shape.
  const [aspects, setAspects] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase
        .from('bookmarks')
        .select('id,url,title,description,image_url,screenshot_url,card_type,image_pref,raw_metadata')
        .or('image_url.not.is.null,screenshot_url.not.is.null')
        .order('created_at', { ascending: false })
        .limit(FETCH_LIMIT)
      setRows(data || [])
    })()
  }, [])

  const candidates: Candidate[] = useMemo(() => {
    const seenDomain = new Map<string, number>()
    const out: Candidate[] = []
    for (const b of rows) {
      const imgs = cardImageCandidates(
        b.url, b.image_url, b.screenshot_url, b.card_type, b.image_pref,
        b.raw_metadata?.customImage ?? null,
      )
      if (!imgs.length || broken.has(b.id)) continue
      const domain = (() => { try { return new URL(b.url).hostname.replace(/^www\./, '') } catch { return b.url } })()
      const n = seenDomain.get(domain) ?? 0
      if (n >= PER_DOMAIN) continue
      seenDomain.set(domain, n + 1)
      out.push({
        id: b.id,
        url: b.url,
        caption: formatCardTitle({
          title: b.title, description: b.description, url: b.url,
          siteName: b.raw_metadata?.og?.site_name ?? null,
        }),
        image: imgs[0],
      })
      if (out.length >= SHOW_LIMIT) break
    }
    return out
  }, [rows, broken])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copySelection = async () => {
    const picks = candidates
      .filter((c) => selected.has(c.id))
      .map(({ id, url, caption, image }) => ({
        id, url, caption, image,
        ...plateFor(aspects.get(id) ?? 1),
      }))
    await navigator.clipboard.writeText(JSON.stringify(picks, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-paper px-10 pb-32 pt-10">
      <div className="mx-auto max-w-[1280px]">
        <h1 className="text-[20px] text-black">Hero card picker</h1>
        <p className="mt-1 text-[13px] text-black/50">
          {candidates.length} candidates, newest first, max {PER_DOMAIN} per domain — each in the hero&rsquo;s
          plate style and its real shape (wide / square / tall, from the image&rsquo;s aspect).
          Click to select, then copy the selection out of the bar below.
        </p>

        <div className="mt-10 flex flex-wrap items-start justify-center gap-x-8 gap-y-12">
          {candidates.map((c) => {
            const on = selected.has(c.id)
            const { w, h } = plateFor(aspects.get(c.id) ?? 1)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                className="group block text-left"
                title={c.url}
              >
                <span
                  className={`relative block overflow-hidden rounded-[20px] bg-card transition-shadow ${
                    on ? 'ring-2 ring-black ring-offset-4' : 'group-hover:ring-1 group-hover:ring-black/25 group-hover:ring-offset-4'
                  }`}
                  style={{ width: w, height: h }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.image}
                    alt=""
                    loading="lazy"
                    className="block h-full w-full object-cover"
                    onLoad={(e) => {
                      const img = e.currentTarget
                      if (!img.naturalWidth || !img.naturalHeight) return
                      const a = img.naturalWidth / img.naturalHeight
                      setAspects((prev) => {
                        if (prev.get(c.id) === a) return prev
                        return new Map(prev).set(c.id, a)
                      })
                    }}
                    onError={() => setBroken((prev) => new Set(prev).add(c.id))}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-[21%]"
                    style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, #fff 100%)' }}
                  />
                  {on && (
                    <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-black text-[13px] text-white">
                      ✓
                    </span>
                  )}
                </span>
                <span
                  className="mt-3 block overflow-hidden whitespace-nowrap text-[12px] leading-4 tracking-[0.05em] text-black/50"
                  style={{ width: w, WebkitMaskImage: captionMask(w), maskImage: captionMask(w) }}
                >
                  {c.caption}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selection bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-black/[0.08] bg-white/95 px-10 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between">
          <span className="text-[13px] text-black/60">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-3">
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-[13px] text-black/45 hover:text-black"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={copySelection}
              disabled={selected.size === 0}
              className="font-serif inline-flex h-[40px] items-center rounded-full border border-black/[0.28] bg-white px-6 text-[14px] text-black transition-[border-color] duration-150 hover:border-black/[0.55] disabled:opacity-40"
            >
              {copied ? 'Copied ✓' : 'Copy selection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
