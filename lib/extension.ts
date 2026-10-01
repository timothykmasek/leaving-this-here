// Where the Bulletin Chrome extension lives.
//
// One constant because it was three copies: hardcoded in /start and in the site
// footer, and — the one that mattered — an empty string in SaveHelp, whose CTA
// is gated on it being truthy. So the component whose whole job is pitching the
// extension was the one place that fell back to "open chrome://extensions, turn
// on Developer mode, Load unpacked", months after the extension went live.
//
// That's what copies do. Anything pointing at the store points here now, so a
// resubmission (new ID) is one edit.

export const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/dgpigmcmbffpoigjalnbgfmpgidoabgc'

// The iOS app's App Store page (approved 2026-10-01). No storefront in the
// path, so Apple routes each visitor to their own country's store. Drives the
// footer's iOS link and the iPhone row on /start; null hides both.
export const IOS_APP_URL: string | null =
  'https://apps.apple.com/app/bulletin-links-lists/id6814739882'
