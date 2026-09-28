# Bulletin — Chrome extension

One-click saving of any page, image, or quote into your Bulletin
collection. Authenticates with Google (via Supabase) and posts to the web
app's `/api/extension/save` endpoint, which runs the full enrichment
pipeline server-side (metadata → embedding).

## How it works

A card floated onto the page is the whole experience (2026-09-28 redesign):

- **Toolbar icon** → takes the page's screenshot, then floats a card onto the
  page (top-right, real rounded corners and shadow): an iframe of
  `popup.html?card=1` in a closed shadow root (`mountCard` in
  `background.js`). Nothing saves until you click the plate (or press Enter).
  Click outside, Esc, or the icon again closes it. The card only renders when
  the worker vouches for its tab + one-time key, so a site framing
  `popup.html` (it's web-accessible) gets nothing.
- **Where a page can't take a card** (chrome://, the Web Store, PDF viewers)
  and when signed out, the same `popup.html` opens as the toolbar popup.
- **Saving** is a designed 2.2s beat (`SAVE_BEAT` in `popup.js`): the plate's
  dot grid merges into the page's screenshot, grabbed from your own tab.
- **Lists**: the plate shrinks into the header tile ("Saved to your Bulletin /
  Add it to a list…") and your lists appear, most recently used first. Click a
  row to file, ↗ opens the list, "Create new list" is a field in place.
  **Done**/**Skip** closes the popup. Otherwise it closes itself on a clock
  (8s, top hairline). Creating a list stops it while you type, shows
  "Saved!" and lands the new list at the top, then the clock crawls back. The
  header is the confirmation; there's no final screen.
- **Already saved**: re-saving jumps to "Already in your Bulletin" with its
  lists ticked.
- **Your Bulletin** is always one click away: the wordmark and the
  "View your Bulletin · yourbulletin.com/you ↗" button both open your page.
- **Filing is publishing.** A bullet in at least one list is on your public
  page; a bullet in no list is yours alone (migration 028).
- **Signed out** → the popup shows sign-in (Google, or an emailed code).
- **Right-click the toolbar icon** → "Open your Bulletin" / "Sign out".
  There are no right-click save menus any more.
- **Auth**: Google sign-in via `chrome.identity.launchWebAuthFlow` against
  Supabase's OAuth endpoint (implicit flow). Tokens live in
  `chrome.storage.local` and auto-refresh, so you stay signed in.

The save itself (tab capture, live-DOM meta read, the request, the
screenshot upload) runs in the service worker, driven over a port
(`ig-save`), so it finishes even if the popup closes mid-save.

### Previewing the popup without installing
`dev/preview.html` runs the real `popup.html` on mocked chrome APIs
(`dev/mock-chrome.js`), with a scenario switcher (new save, already saved,
error, …) and a saving-beat picker. Serve this folder over HTTP
(`python3 -m http.server 4322 -d extension`) and open
`http://localhost:4322/dev/preview.html`. Leave `dev/` out of the store zip.

No build step — it's plain JS/HTML loaded as an unpacked extension.

### Endpoints it calls
- `POST /api/extension/save` — enrich + insert (metadata → embed). `PATCH`
  uploads the out-of-band screenshot; `DELETE` served older builds' Undo (the popup has none).
- `GET/POST /api/extension/lists` — the user's lists, most recently used first,
  plus their handle (so every row links to its page); create a new one and/or
  add/remove a bullet (from the popup).
- `POST /api/extension/suggest-list-name` — retired stub (always empty); kept
  only for older store builds. We don't suggest list names.
- `GET /api/extension/finds` — the user's most recent bullets (parked new-tab page).

All are bearer-authenticated with the Supabase access token and RLS-scoped.

## One-time setup

### 1. Load the extension
1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Click **Load unpacked** → select this `extension/` folder.
4. The extension gets an ID like `abcd…`. Pin it to your toolbar.

### 2. Allow-list its redirect URL in Supabase
The extension's OAuth redirect URL is derived from its ID:

```
https://<extension-id>.chromiumapp.org/
```

- Click the extension icon → if you try to sign in before this step, the
  popup will show you the exact URL to copy.
- In **Supabase → Authentication → URL Configuration → Redirect URLs**, add
  that full URL (including the trailing slash) and save.

> Google Cloud needs **no** change — Google still redirects to Supabase's
> `…supabase.co/auth/v1/callback`, which is already configured. Only Supabase's
> allow-list needs the chromiumapp URL.

### 3. Point at the right API
`config.js` → `API_BASE`:
- Production (default): `https://www.yourbulletin.com` (the canonical host —
  the apex 308-redirects to it, and a redirect can drop the auth header).
- Local testing: `http://localhost:3000` (run `npm run dev`).
- Confirm `manifest.json` `host_permissions` covers whichever you use.

## Usage
- Click the Bulletin icon on any page → it saves instantly; an on-page card
  confirms it and lets you publish it to a list (that's what puts it on your page).
- Right-click a page / image / selection → **Save … to Bulletin**.
- Right-click the toolbar icon → **Open my finds** / **Sign out**.

## Notes
- The Supabase anon key in `config.js` is a public client key (same as the web
  app's) — safe to ship. No service-role key is ever in the extension.
- If sign-in fails with a redirect error, re-check step 2 — the URL must match
  the extension's current ID exactly (it changes if you remove/re-add unpacked).
