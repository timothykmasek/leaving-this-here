'use client'

import { useState } from 'react'
import type { EmbedInfo } from '@/lib/rich-embed'

// Inline player card for known platforms. YouTube/Vimeo are click-to-play
// (no autoplay sprawl on page load); Spotify is always-live because the
// embed is small and click-interactive by design.
//
// All variants live inside a `rounded-xl` card so they sit in the folio
// grid the same way static BookmarkCard variants do.

function PlayIcon() {
  return (
    <div className="w-14 h-14 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center shadow-lg">
      <svg
        viewBox="0 0 24 24"
        fill="white"
        className="w-5 h-5 ml-0.5"
        aria-hidden
      >
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
  )
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export function YouTubeEmbed({
  info, title, url, isPrivate,
}: { info: EmbedInfo; title: string | null; url: string; isPrivate: boolean }) {
  const [playing, setPlaying] = useState(false)
  const cleanTitle = title?.trim() || getDomain(url)

  return (
    <div className="bg-white rounded-xl overflow-hidden border border-gray-150 hover:border-gray-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all">
      <div className="relative aspect-video bg-black overflow-hidden">
        {!playing ? (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setPlaying(true)
            }}
            className="absolute inset-0 w-full h-full group/play"
            aria-label="play video"
          >
            {info.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={info.thumbnail}
                alt={cleanTitle}
                className="w-full h-full object-cover"
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center group-hover/play:scale-110 transition-transform">
              <PlayIcon />
            </div>
          </button>
        ) : (
          <iframe
            src={info.embedUrl}
            title={cleanTitle}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        )}
        {isPrivate && (
          <div className="absolute top-3 left-3 bg-black/60 text-white px-2 py-0.5 rounded text-xs">
            private
          </div>
        )}
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 hover:bg-gray-50 transition-colors">
        <h3 className="font-semibold text-[14px] leading-snug text-gray-900 line-clamp-2 tracking-tight">
          {cleanTitle}
        </h3>
        <p className="text-[11px] text-gray-400 mt-1">youtube</p>
      </a>
    </div>
  )
}

export function VimeoEmbed({
  info, title, url, isPrivate,
}: { info: EmbedInfo; title: string | null; url: string; isPrivate: boolean }) {
  const [playing, setPlaying] = useState(false)
  const cleanTitle = title?.trim() || getDomain(url)

  return (
    <div className="bg-white rounded-xl overflow-hidden border border-gray-150 hover:border-gray-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all">
      <div className="relative aspect-video bg-black overflow-hidden">
        {!playing ? (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setPlaying(true)
            }}
            className="absolute inset-0 w-full h-full bg-gradient-to-br from-[#1ab7ea] via-[#0d8fbc] to-[#004b5e] flex items-center justify-center group/play"
            aria-label="play video"
          >
            <div className="group-hover/play:scale-110 transition-transform">
              <PlayIcon />
            </div>
          </button>
        ) : (
          <iframe
            src={info.embedUrl}
            title={cleanTitle}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        )}
        {isPrivate && (
          <div className="absolute top-3 left-3 bg-black/60 text-white px-2 py-0.5 rounded text-xs">
            private
          </div>
        )}
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 hover:bg-gray-50 transition-colors">
        <h3 className="font-semibold text-[14px] leading-snug text-gray-900 line-clamp-2 tracking-tight">
          {cleanTitle}
        </h3>
        <p className="text-[11px] text-gray-400 mt-1">vimeo</p>
      </a>
    </div>
  )
}

export function SpotifyEmbed({
  info, title, url, isPrivate,
}: { info: EmbedInfo; title: string | null; url: string; isPrivate: boolean }) {
  const cleanTitle = title?.trim() || getDomain(url)
  const isShort = info.spotifyType === 'track' || info.spotifyType === 'episode'
  // Spotify's official embed heights: 152 for track/episode, 352+ for
  // album/playlist/show/artist with a track list. We fit the taller embed
  // to the card aspect by letting it own the card's body height.
  const iframeHeight = isShort ? 152 : 352

  return (
    <div className="bg-white rounded-xl overflow-hidden border border-gray-150 hover:border-gray-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all">
      <div className="relative">
        <iframe
          src={info.embedUrl}
          title={cleanTitle}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          height={iframeHeight}
          className="w-full block"
          style={{ border: 0 }}
        />
        {isPrivate && (
          <div className="absolute top-3 left-3 bg-black/60 text-white px-2 py-0.5 rounded text-xs">
            private
          </div>
        )}
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 hover:bg-gray-50 transition-colors">
        <h3 className="font-semibold text-[14px] leading-snug text-gray-900 line-clamp-2 tracking-tight">
          {cleanTitle}
        </h3>
        <p className="text-[11px] text-gray-400 mt-1">spotify · {info.spotifyType}</p>
      </a>
    </div>
  )
}

export function RichEmbedCard({
  info, title, url, isPrivate,
}: { info: EmbedInfo; title: string | null; url: string; isPrivate: boolean }) {
  if (info.kind === 'youtube')
    return <YouTubeEmbed info={info} title={title} url={url} isPrivate={isPrivate} />
  if (info.kind === 'spotify')
    return <SpotifyEmbed info={info} title={title} url={url} isPrivate={isPrivate} />
  if (info.kind === 'vimeo')
    return <VimeoEmbed info={info} title={title} url={url} isPrivate={isPrivate} />
  return null
}
