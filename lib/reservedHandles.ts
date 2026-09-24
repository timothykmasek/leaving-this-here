// Handles nobody can claim: every top-level route in app/ (a profile at the
// same path would be unreachable, since the static route wins), plus names
// that smell like infrastructure or the brand. One list for both the live
// availability check (/api/username-check) and the authoritative claim
// (/api/onboarding/setup); the two used to keep their own copies and drifted.
export const RESERVED_HANDLES = new Set([
  // app/ routes
  'activate', 'api', 'auth', 'claude', 'fonts', 'import', 'login', 'oauth',
  'preview', 'privacy', 'settings', 'start', 'mcp',
  // planned or legacy paths
  'logout', 'signup', 'setup', 'save', 'bookmarklet', 'terms', 'about', 'help',
  'admin', 'profile', 'search', 'lists', 'list', 'extension', 'new', 'edit',
  'me', 'home', 'index', 'blog', 'app', 'ios', 'support', 'contact',
  // infrastructure
  'www', 'mail', 'static', 'assets', 'public',
  // brand
  'according', 'accordingto', 'official', 'bulletin', 'bulletins', 'yourbulletin',
])
