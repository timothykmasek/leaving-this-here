-- 028: visibility follows filing.
--
-- The rule (Tim, 2026-09-22): a bullet is public if and only if it sits in at
-- least one list. Lists are always public. There is no per-bullet or per-list
-- privacy setting any more — filing IS publishing, and an unfiled bullet is
-- the owner's alone.
--
-- `bookmarks.is_private` stays, because everything already reads it (RLS 026,
-- the search RPCs, the MCP filters, the profile grid's lock chip). It becomes
-- DERIVED: two triggers keep it equal to "not filed anywhere", so nothing can
-- set it by hand — an old extension build PATCHing the flag is overwritten on
-- the same write. One source of truth (membership), one cached bit, zero
-- drift.
--
-- Safe to run BEFORE or AFTER the matching deploy: the old code keeps working
-- against a derived column. The column drops (lists.is_private,
-- bookmarks.pinned_at) live in 029, to run only after the deploy that stops
-- reading them.
--
-- Apply from the repo root:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
--        -f migrations/028_visibility_follows_filing.sql
-- (or paste into the Supabase SQL editor).

-- ── 1. Bookmark writes recompute the flag ──────────────────────────────────
-- BEFORE so the row is written with the right value in the same statement.
-- A fresh insert has no memberships yet → born private. security definer so
-- the membership probe isn't subject to the caller's RLS.
create or replace function public.bookmarks_derive_visibility()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.is_private := not exists (
    select 1 from public.list_bookmarks lb where lb.bookmark_id = new.id
  );
  return new;
end $$;

drop trigger if exists bookmarks_derive_visibility on public.bookmarks;
create trigger bookmarks_derive_visibility
  before insert or update on public.bookmarks
  for each row execute function public.bookmarks_derive_visibility();

-- ── 2. Membership changes recompute the bullet ─────────────────────────────
-- AFTER, so the membership row is already there (or gone). Fires per row on a
-- list delete's cascade too, so deleting a list unpublishes whatever was filed
-- only there.
create or replace function public.list_bookmarks_sync_visibility()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  bid uuid;
begin
  foreach bid in array array_remove(array[
    case when tg_op in ('INSERT', 'UPDATE') then new.bookmark_id end,
    case when tg_op in ('DELETE', 'UPDATE') then old.bookmark_id end
  ], null)
  loop
    update public.bookmarks b
       set is_private = not exists (
         select 1 from public.list_bookmarks lb where lb.bookmark_id = b.id
       )
     where b.id = bid;
  end loop;
  return null;
end $$;

drop trigger if exists list_bookmarks_sync_visibility on public.list_bookmarks;
create trigger list_bookmarks_sync_visibility
  after insert or update of bookmark_id or delete on public.list_bookmarks
  for each row execute function public.list_bookmarks_sync_visibility();

-- ── 3. Lists are public, full stop ─────────────────────────────────────────
-- The read policies stop consulting lists.is_private (029 drops the column).
drop policy if exists "read public lists" on public.lists;
create policy "lists are public"
  on public.lists for select
  using (true);

drop policy if exists "read membership of visible lists" on public.list_bookmarks;
create policy "membership is public"
  on public.list_bookmarks for select
  using (true);

-- ── 4. You can only file your OWN bullets ──────────────────────────────────
-- Filing now publishes, so the old policy (list owner only) would let anyone
-- who learned a bookmark id publish someone else's private bullet into their
-- own list. Both sides must be the caller's.
drop policy if exists "owner manages membership" on public.list_bookmarks;
create policy "owner manages membership"
  on public.list_bookmarks for all
  using (
    exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid())
    and exists (select 1 from public.bookmarks b where b.id = bookmark_id and b.user_id = auth.uid())
  );

-- ── 5. Backfill + tighten ──────────────────────────────────────────────────
-- Every existing bullet gets the derived value (unfiled → private). The
-- column was nullable; the triggers always write a boolean, so lock that in.
update public.bookmarks b
   set is_private = not exists (
     select 1 from public.list_bookmarks lb where lb.bookmark_id = b.id
   )
 where b.is_private is distinct from not exists (
     select 1 from public.list_bookmarks lb where lb.bookmark_id = b.id
   );

alter table public.bookmarks alter column is_private set not null;
alter table public.bookmarks alter column is_private set default true;

-- Any list flagged private (none in prod at the time of writing) is public now.
update public.lists set is_private = false where is_private;
