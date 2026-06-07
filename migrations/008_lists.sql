-- Migration 008: lists + list membership
-- Run in Supabase SQL editor when ready. The app falls back gracefully if
-- these tables are missing (lists just show empty), so there's no ordering
-- dependency with deploys.
--
-- Model:
--   A `list` is a named, user-owned collection of bookmarks ("Architects",
--   "Menswear Brands"). Membership is a many-to-many via list_bookmarks, so a
--   gem can live in several lists. Lists are public by default; `is_private`
--   keeps one off the owner's public profile.

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists lists_user_idx on public.lists(user_id);

create table if not exists public.list_bookmarks (
  list_id uuid not null references public.lists(id) on delete cascade,
  bookmark_id uuid not null references public.bookmarks(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, bookmark_id)
);

create index if not exists list_bookmarks_bookmark_idx
  on public.list_bookmarks(bookmark_id);

alter table public.lists enable row level security;
alter table public.list_bookmarks enable row level security;

-- lists: anyone can read public lists; owners can read + write all of theirs.
drop policy if exists "read public lists" on public.lists;
create policy "read public lists"
  on public.lists for select
  using (not is_private or user_id = auth.uid());

drop policy if exists "owner manages lists" on public.lists;
create policy "owner manages lists"
  on public.lists for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- list_bookmarks: readable when the parent list is readable; writable only by
-- the list's owner.
drop policy if exists "read membership of visible lists" on public.list_bookmarks;
create policy "read membership of visible lists"
  on public.list_bookmarks for select
  using (exists (
    select 1 from public.lists l
    where l.id = list_id and (not l.is_private or l.user_id = auth.uid())
  ));

drop policy if exists "owner manages membership" on public.list_bookmarks;
create policy "owner manages membership"
  on public.list_bookmarks for all
  using (exists (
    select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.lists l where l.id = list_id and l.user_id = auth.uid()
  ));
