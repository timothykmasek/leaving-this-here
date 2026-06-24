# according to — Chrome extension

One-click saving of any page, image, or quote into your according to
collection. Authenticates with Google (via Supabase) and posts to the web
app's `/api/extension/save` endpoint, which runs the full enrichment
pipeline server-side (metadata → auto-tags → embedding).

## How it works

mymind-style, one-click:

- **Toolbar icon (signed in)** → saves the current page *immediately*. No popup,
  no preview, no "save" button. A small **on-page toast** slides in ("Saving…"
  → "Saved to your finds") where you can **add it to a list** right after.
- **Toolbar icon (signed out)** → opens a tiny popup whose only job is Google
  sign-in. The moment you sign in it saves the page you were on and closes.
- **Right-click a page / image / selection** → save just that. Same on-page toast.
- **Right-click the toolbar icon** → "Open my finds" / "Sign out".
- **Auth**: Google sign-in via `chrome.identity.launchWebAuthFlow` against
  Supabase's OAuth endpoint (implicit flow). Tokens live in
  `chrome.storage.local` and auto-refresh, so you stay signed in.

How the click knows whether to save or sign in: while signed in we clear the
action popup (`chrome.action.setPopup({popup:''})`) so the click fires straight
into the service worker; signed out, `popup.html` is restored.

The toast (`content/toast.js`) is injected into the page in a shadow DOM, so the
host page's CSS can't touch it. On pages where Chrome forbids injection
(`chrome://`, the Web Store, some PDF viewers) it falls back to a native
notification.

No build step — it's plain JS/HTML loaded as an unpacked extension.

### Endpoints it calls
- `POST /api/extension/save` — enrich + insert (metadata → auto-tags → embed).
- `POST /api/extension/tags` — replace a saved gem's tags (from the toast).

Both are bearer-authenticated with the Supabase access token and RLS-scoped.

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
- Click the according to icon on any page → it saves instantly; an on-page card
  confirms it and lets you add it to a list.
- Right-click a page / image / selection → **Save … to according to**.
- Right-click the toolbar icon → **Open my finds** / **Sign out**.

## Notes
- The Supabase anon key in `config.js` is a public client key (same as the web
  app's) — safe to ship. No service-role key is ever in the extension.
- If sign-in fails with a redirect error, re-check step 2 — the URL must match
  the extension's current ID exactly (it changes if you remove/re-add unpacked).
