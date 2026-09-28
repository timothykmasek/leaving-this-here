-- 033: private lists.
--
-- The rule (Tim, 2026-09-28): lists are public by default, and an owner CAN
-- make one private, deliberately, from the list page's ⋯ menu on the web.
-- Nothing at save time (extension, iOS, dock) offers the switch.
--
-- Visibility still follows filing (028), with one word added: a bullet is
-- public iff it sits in at least one PUBLIC list. A bullet filed only in
-- private lists is the owner's alone, exactly like an unfiled one.
--
-- Everything that reads lists goes through the caller's JWT (server pages,
-- sitemap, /mcp, the extension routes), so the policies below are the whole
-- enforcement: a private list's row, its membership, and its URL all vanish
-- for anyone but the owner, and its slug 404s.
--
-- Apply from the repo root:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 --single-transaction \
--        -f migrations/033_private_lists.sql
-- (or paste into the Supabase SQL editor).

-- ── 1. The flag ────────────────────────────────────────────────────────────
alter table public.lists
  add column if not exists is_private boolean not null default false;

-- ── 2. One definition of "unpublished" ─────────────────────────────────────
-- security definer so the probe sees every list regardless of the caller.
create or replace function public.bookmark_is_unpublished(bid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1
      from public.list_bookmarks lb
      join public.lists l on l.id = lb.list_id
     where lb.bookmark_id = bid
       and not l.is_private
  )
$$;

-- Bookmark writes (028 §1), now through the shared definition.
create or replace function public.bookmarks_derive_visibility()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.is_private := public.bookmark_is_unpublished(new.id);
  return new;
end $$;

-- Membership changes (028 §2), same.
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
       set is_private = public.bookmark_is_unpublished(b.id)
     where b.id = bid;
  end loop;
  return null;
end $$;

-- ── 3. Flipping a list recomputes its members ──────────────────────────────
-- AFTER, so the new flag is what the probe reads.
create or replace function public.lists_sync_visibility()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.bookmarks b
     set is_private = public.bookmark_is_unpublished(b.id)
   where b.id in (
     select lb.bookmark_id from public.list_bookmarks lb where lb.list_id = new.id
   );
  return null;
end $$;

drop trigger if exists lists_sync_visibility on public.lists;
create trigger lists_sync_visibility
  after update of is_private on public.lists
  for each row
  when (old.is_private is distinct from new.is_private)
  execute function public.lists_sync_visibility();

-- ── 4. Read policies ───────────────────────────────────────────────────────
-- Replaces 028 §3's "lists are public" / "membership is public".
drop policy if exists "lists are public" on public.lists;
create policy "public lists, or your own"
  on public.lists for select
  using (not is_private or user_id = auth.uid());

-- Membership follows its list. The subquery is itself subject to the lists
-- policy above, so a private list's rows disappear with it (no leaking which
-- bullets sit in a list you can't see).
drop policy if exists "membership is public" on public.list_bookmarks;
create policy "membership of visible lists"
  on public.list_bookmarks for select
  using (exists (select 1 from public.lists l where l.id = list_id));

-- No backfill needed: every existing list is born public (default false), so
-- every bullet's derived value is unchanged.
