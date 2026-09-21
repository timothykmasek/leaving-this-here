'use client'

import { useState } from 'react'

// The functional center of /claude: the connector URL with one-click copy.
// Same quiet confirmation pattern as the profile share affordances — the
// button says "copied" for a beat instead of toasting.
export function CopyConnectorUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard can be denied; the URL is selectable text either way.
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-card px-5 py-4">
      <code className="select-all overflow-x-auto whitespace-nowrap font-mono text-[13px] tracking-[-0.01em] text-ink sm:text-[15px]">
        {url.replace(/^https:\/\//, '')}
      </code>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-lg bg-ink px-4 py-1.5 font-sans text-[13px] font-[600] text-paper transition-opacity hover:opacity-80"
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  )
}
