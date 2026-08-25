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
