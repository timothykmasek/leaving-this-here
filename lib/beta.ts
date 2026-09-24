// Private-beta switch. The Supabase "allow signups" toggle must stay ON —
// GoTrue counts attaching a first Google identity to a pre-created account as
// a "signup", so turning it off locks out the very people we invited (learned
// live, 2026-09-02). The gate is therefore enforced here in app code instead:
// while true, an authenticated user WITHOUT a profile is not on the guest list
// and profiles are only minted by scripts/invite.ts. Opened to self-serve
// signups 2026-09-24; flip back to true to close the door again.
export const INVITE_ONLY = false

// Sign in with Apple on the web (/start and /login). Configured 2026-09-24:
// Services ID com.yourbulletin.web, key NG34DTRP3Q, team 99L24P45G7, and a
// client secret in the Supabase Apple provider next to the iOS bundle ID.
// The secret is a JWT Apple caps at 6 months: it EXPIRES 2027-03-23, and web
// Apple sign-in silently breaks after that. Regenerate from the .p8 and paste
// it into Supabase before then. Set false to hide the button.
export const APPLE_WEB_SIGNIN = true
