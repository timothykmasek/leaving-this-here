// Click-time attribution on outbound saved links: the destination site's
// analytics sees utm_source=bulletin (and which curator sent the click).
// Applied at RENDER only — stored URLs stay clean. url_key normalization
// strips other people's trackers on the way IN; this adds ours on the way
// OUT, and the two must never meet: never persist a URL this returns.
export function withBulletinUtm(url: string, campaign?: string | null): string {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return url
    // A URL that already carries someone's utm_source is left alone — the
    // saver kept it on purpose, and two sources make both meaningless.
    if (u.searchParams.has('utm_source')) return url
    u.searchParams.set('utm_source', 'bulletin')
    u.searchParams.set('utm_medium', 'referral')
    if (campaign) u.searchParams.set('utm_campaign', campaign)
    return u.toString()
  } catch {
    // Relative (internal) hrefs and malformed URLs pass through untouched.
    return url
  }
}
