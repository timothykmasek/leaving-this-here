-- Shelf dismissals — makes "✕ not for this list" sync across devices.
--
-- OPTIONAL, paste-once (Supabase SQL editor). Without it, dismissals still
-- work but live in each browser's localStorage. With it, the shelf writes a
-- row per refusal and /api/lists/[id]/suggestions filters them out server-side
-- for every device. The app tolerates the table being absent — writes fail
-- silently to the local layer, reads treat errors as "no dismissals".
--
-- One row = "never suggest this bookmark for this list again."

create table if not exists public.shelf_dismissals (
  -- Defaulting to auth.uid() lets the client insert just (list_id, bookmark_id).
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  list_id uuid not null references public.lists(id) on delete cascade,
  bookmark_id uuid not null references public.bookmarks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, bookmark_id)
);

alter table public.shelf_dismissals enable row level security;

-- Dismissals are a private per-owner preference: only yours, in every direction.
drop policy if exists "owner manages own dismissals" on public.shelf_dismissals;
create policy "owner manages own dismissals"
  on public.shelf_dismissals for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
