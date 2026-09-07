-- Durable activation tokens — the "sign in whenever you want" link for claimed
-- previews and invitees. Supabase's own magic links cap at 1h; this is a token
-- WE control, single-use but non-expiring, so the person can activate on their
-- own schedule. At click-time /activate mints and consumes a fresh Supabase
-- session server-side, so the 1h OTP window never reaches the user.
--
-- Only the service role touches this table (the /activate route). RLS on with
-- no policies = denied to anon/authenticated, bypassed by service role.
--
-- Run in the Supabase SQL editor / via psql.

create table if not exists activation_tokens (
  token_hash text primary key,          -- sha256(raw token), hex
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at    timestamptz
);

create index if not exists activation_tokens_user_idx on activation_tokens(user_id);

alter table activation_tokens enable row level security;
