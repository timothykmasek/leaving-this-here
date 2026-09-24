// Private-beta switch. The Supabase "allow signups" toggle must stay ON —
// GoTrue counts attaching a first Google identity to a pre-created account as
// a "signup", so turning it off locks out the very people we invited (learned
// live, 2026-09-02). The gate is therefore enforced here in app code instead:
// while true, an authenticated user WITHOUT a profile is not on the guest list
// and profiles are only minted by scripts/invite.ts. Opened to self-serve
// signups 2026-09-24; flip back to true to close the door again.
export const INVITE_ONLY = false

// Sign in with Apple on the web. The provider is on in Supabase for the iOS
// app's native id_token flow, but the web redirect flow also needs a Services
// ID and a generated client secret in the Supabase Apple provider settings
// ("Unsupported provider: missing OAuth secret" until then). Flip to true once
// those are in, and the Apple button appears on /start and /login.
export const APPLE_WEB_SIGNIN = false
