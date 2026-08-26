// Shown on preview profiles — pages we seeded for someone who hasn't claimed
// them yet. Says plainly what the page is so a visitor (usually the person the
// preview was built for, arriving from a DM) isn't left wondering why it
// exists. Not dismissable: it's a statement of status, not a notification.
export function PreviewBanner() {
  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-900/15 bg-amber-50/70 px-4 py-3">
      <span className="relative inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-500" />
      <p className="flex-1 text-sm text-amber-950">
        A curated preview — <b>Bulletin</b> is in private beta.
      </p>
    </div>
  )
}
