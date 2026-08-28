-- Migration 024: waitlist — private-beta email capture from the landing page.
-- Run in Supabase SQL editor when ready.
--
-- One global list (nothing per-creator — that's folio_subscribers, dormant).
-- Anonymous visitors never touch this table directly: RLS is on with NO
-- policies, so the only pathway is /api/waitlist writing with the service
-- role. No confirm/unsubscribe machinery — it's a beta interest list, not a
-- mailing list; if it ever becomes one, emails migrate into whatever Resend
-- audience does digests.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'landing',  -- where the capture happened, in case other doors appear
  created_at timestamptz not null default now()
);

-- Same person twice is a no-op, not a second row. Case-insensitive: the API
-- lowercases before insert, the index backstops anything that doesn't.
create unique index if not exists waitlist_email_key
  on public.waitlist (lower(email));

alter table public.waitlist enable row level security;
