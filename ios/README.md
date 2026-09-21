# Bulletin iOS

Save-first iPhone app: the share extension puts Bulletin in the iOS share
sheet (the mobile equivalent of the Chrome extension), backed by the same
`/api/extension/*` endpoints. The in-app browse screen is deliberately thin
for v0.1.

## Build

Requires Xcode (App Store) with the iOS platform installed, plus
`brew install xcodegen`.

```bash
cd ios
xcodegen generate      # writes Bulletin.xcodeproj (generated; not committed)
xcodebuild -project Bulletin.xcodeproj -scheme Bulletin \
  -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Or open `Bulletin.xcodeproj` in Xcode and hit run.

## One-time external setup

- Supabase → Authentication → URL Configuration → add `bulletin://auth-callback`
  to Redirect URLs (the app's sign-in return path).
- App Store era (needs the Apple Developer account): Sign in with Apple
  (App Store rule when Google login is offered), real App Group +
  Keychain-backed session storage (see TODO in `Session.swift`), review
  demo account for the invite gate.

## Layout

- `Bulletin/Core` — Config, Session (auth), API client. Compiled into BOTH
  targets; anything the share extension needs lives here, not in Views.
- `Bulletin/App`, `Bulletin/Views` — app shell: sign-in, thin home.
- `BulletinShare` — the share extension: URL extraction + the one-frame
  save flow (save + list rows + one suggestion reveal together, per the
  Chrome extension's 0.4.3 rule).
