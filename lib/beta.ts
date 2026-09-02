// Private-beta switch. The Supabase "allow signups" toggle must stay ON —
// GoTrue counts attaching a first Google identity to a pre-created account as
// a "signup", so turning it off locks out the very people we invited (learned
// live, 2026-09-02). The gate is therefore enforced here in app code instead:
// an authenticated user WITHOUT a profile is not on the guest list — profiles
// are only minted by scripts/invite.ts during the beta. Flip to false to
// reopen self-serve onboarding.
export const INVITE_ONLY = true
