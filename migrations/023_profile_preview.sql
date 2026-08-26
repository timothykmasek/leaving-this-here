-- Preview profiles — seeded concierge previews for founder outreach.
--
-- A preview profile is reachable by direct link (the DM carries it) but is
-- kept out of discovery: excluded from the sitemap, marked noindex, and the
-- page renders a "private beta" banner. Cleared when the person claims the
-- account (scripts/harvest/claim-profile.mjs).
--
-- Run in the Supabase SQL editor.

alter table profiles
  add column if not exists is_preview boolean not null default false;
