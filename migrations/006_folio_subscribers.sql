-- Migration 006: folio_subscribers + RPC for subscribe / confirm / unsubscribe
-- Run in Supabase SQL editor when ready. Code falls back gracefully if the
-- table or functions are missing.
--
-- Model:
--   One row per (owner, email). Email subscribers follow a creator's folio and
--   receive a digest "every 10 new saves, or monthly, whichever comes first"
--   (digest cadence enforced by the cron job in Phase 3, not the table).
--
-- Access pattern:
--   Owners can read their own subscriber list (RLS).
--   Anonymous visitors interact only through three RPC functions below
--   (subscribe / confirm / unsubscribe), which run with SECURITY DEFINER and
--   encapsulate all writes. Direct INSERT / UPDATE from anon is forbidden.

create table if not exists public.folio_subscribers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  confirm_token text unique,                   -- null once confirmed
  confirmed_at timestamptz,
  unsubscribe_token text unique not null default gen_random_uuid()::text,
  unsubscribed_at timestamptz,
  last_digest_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, email)
);

create index if not exists folio_subscribers_owner_idx
  on public.folio_subscribers(owner_id)
  where unsubscribed_at is null and confirmed_at is not null;

alter table public.folio_subscribers enable row level security;

-- Owners see their own subscriber list. That's the only direct-access policy.
drop policy if exists "owners see their subscribers" on public.folio_subscribers;
create policy "owners see their subscribers"
  on public.folio_subscribers for select
  using (owner_id = auth.uid());

-- ── RPC: folio_subscribe ───────────────────────────────────────────────
-- Creates a pending subscription and returns a fresh confirm_token so the
-- API route can include it in the confirmation email.
-- Idempotent: if the email is already an active subscriber, returns null
-- (caller should treat that as "already subscribed, no email needed").

create or replace function public.folio_subscribe(p_owner_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.folio_subscribers;
  token text;
begin
  if p_owner_id is null or p_email is null or length(trim(p_email)) = 0 then
    raise exception 'missing owner or email';
  end if;

  select * into existing
  from public.folio_subscribers
  where owner_id = p_owner_id and lower(email) = lower(trim(p_email));

  -- Already a live subscriber — nothing to do.
  if existing.id is not null
     and existing.confirmed_at is not null
     and existing.unsubscribed_at is null then
    return null;
  end if;

  token := gen_random_uuid()::text;

  if existing.id is null then
    insert into public.folio_subscribers (owner_id, email, confirm_token)
    values (p_owner_id, lower(trim(p_email)), token);
  else
    -- Re-issue a fresh confirm token (covers: unsubscribed rejoining,
    -- pending subscribe that never got confirmed).
    update public.folio_subscribers
    set confirm_token = token,
        confirmed_at = null,
        unsubscribed_at = null
    where id = existing.id;
  end if;

  return token;
end;
$$;

-- ── RPC: folio_confirm ─────────────────────────────────────────────────
-- Flips a pending subscriber to confirmed. Returns owner_id + email so the
-- caller can show a "welcome" page.

create or replace function public.folio_confirm(p_token text)
returns table (owner_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.folio_subscribers s
  set confirmed_at = now(),
      confirm_token = null
  where s.confirm_token = p_token
    and s.confirmed_at is null
  returning s.owner_id, s.email;
end;
$$;

-- ── RPC: folio_unsubscribe ─────────────────────────────────────────────
-- Marks a subscriber as unsubscribed via their permanent unsubscribe token.
-- Token is included in every digest email.

create or replace function public.folio_unsubscribe(p_token text)
returns table (owner_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.folio_subscribers s
  set unsubscribed_at = now()
  where s.unsubscribe_token = p_token
    and s.unsubscribed_at is null
  returning s.owner_id, s.email;
end;
$$;

-- Grant anonymous + authenticated access to the RPCs. RLS on the table
-- still blocks direct writes; these functions are the only safe pathway.
grant execute on function public.folio_subscribe(uuid, text) to anon, authenticated;
grant execute on function public.folio_confirm(text) to anon, authenticated;
grant execute on function public.folio_unsubscribe(text) to anon, authenticated;
