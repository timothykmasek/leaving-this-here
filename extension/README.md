# internet gems — Chrome extension

One-click saving of any page, image, or quote into your internet gems
collection. Authenticates with Google (via Supabase) and posts to the web
app's `/api/extension/save` endpoint, which runs the full enrichment
pipeline server-side (metadata → auto-tags → embedding).

## How it works

- **Toolbar icon** → popup: shows the current page, optional note, one "save 💎" button.
- **Right-click menu** → save the page, an image, or a highlighted quote without opening the popup.
- **Auth**: Google sign-in via `chrome.identity.launchWebAuthFlow` against Supabase's OAuth endpoint (implicit flow). Tokens live in `chrome.storage.local` and auto-refresh.

No build step — it's plain JS/HTML loaded as an unpacked extension.

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
- Local testing: `http://localhost:3000` (default; run `npm run dev`).
- Production: your Vercel domain. Also confirm `manifest.json`
  `host_permissions` covers that domain.

## Usage
- Click the icon on any page → **save 💎** (add a note first if you like).
- Right-click a page / image / selection → **Save … to internet gems 💎**.
- A badge (✓ / !) and a notification confirm the result.

## Notes
- The Supabase anon key in `config.js` is a public client key (same as the web
  app's) — safe to ship. No service-role key is ever in the extension.
- If sign-in fails with a redirect error, re-check step 2 — the URL must match
  the extension's current ID exactly (it changes if you remove/re-add unpacked).
