-- Migration 034: security lockdown (2026-09-30 audit).
-- Run in the Supabase SQL editor. Safe to re-run.

-- ── 1. Old SECURITY DEFINER functions the public key could call ─────────────
-- backfill_bookmark (002) let anyone holding the public anon key rewrite any
-- bullet's title, image and metadata. Its only caller, /api/backfill-images,
-- is deleted.
drop function if exists public.backfill_bookmark(uuid, text, text, text, text, text, text, jsonb);
drop function if exists public.backfill_bookmark(uuid, text, text, text, text, text, text);

-- Folio (006/007) is retired. folio_digests_due returned every subscriber's
-- email and unsubscribe token to anyone; folio_subscribe handed back the
-- confirm token, so anyone could subscribe any address.
drop function if exists public.folio_digests_due(int, int);
drop function if exists public.folio_digest_mark_sent(uuid);
drop function if exists public.folio_subscribe(uuid, text);
drop function if exists public.folio_confirm(text);
drop function if exists public.folio_unsubscribe(text);
-- The folio_subscribers table itself is left alone (owner-only RLS); drop it
-- separately once you're sure nothing in it is worth keeping.

-- ── 2. Rate limits for routes that spend money ──────────────────────────────
-- Fixed-window counters. One row per (key, window start). lib/rateLimit.ts
-- calls hit_rate_limit() with the service role; nobody else can touch it.
create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;  -- no policies: service role only

create or replace function public.hit_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean  -- true = allowed, false = over the limit
language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into public.rate_limits (key, window_start, count)
  values (p_key, w, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into n;

  -- Opportunistic cleanup, ~1% of calls.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;

  return n <= p_max;
end;
$$;

revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;

-- ── 3. A bullet's source can't be rewritten ─────────────────────────────────
-- The free import allowance counts source = 'import' rows. Owners can update
-- their own bookmarks through the API, so without this they could relabel
-- imports and reset the cap. Source is set once, at insert.
create or replace function public.bookmarks_keep_source()
returns trigger language plpgsql as $$
begin
  new.source := old.source;
  return new;
end;
$$;

drop trigger if exists bookmarks_keep_source on public.bookmarks;
create trigger bookmarks_keep_source
  before update of source on public.bookmarks
  for each row execute function public.bookmarks_keep_source();

-- ── 4. Checks to run afterwards (read-only) ─────────────────────────────────
-- a) Every public function and who may run it. Anything SECURITY DEFINER
--    (prosecdef = true) that anon can execute deserves a second look:
--      select proname, prosecdef, proacl from pg_proc
--       where pronamespace = 'public'::regnamespace order by proname;
-- b) Policies, including storage. bookmarks/profiles/follows writes should all
--    carry with_check (user_id = auth.uid()) / (id = auth.uid()); storage.objects
--    should have no anon or authenticated INSERT/UPDATE on card-images:
--      select schemaname, tablename, policyname, cmd, roles, qual, with_check
--        from pg_policies where schemaname in ('public', 'storage')
--       order by schemaname, tablename;
