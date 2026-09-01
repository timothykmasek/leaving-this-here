-- 026: enforce bookmark privacy at the database.
--
-- The `is_private` column has existed on bookmarks since the beginning, but the
-- SELECT policy was "public reads" — nothing ever set the flag, so the gap never
-- mattered. The extension popup now exposes a public/secret toggle on every
-- save, which makes the flag real: a secret bullet must be visible on the
-- owner's logged-in view and absent from the logged-out view.
--
-- Enforcing this in RLS (mirroring lists, migration 008) means every read path
-- — the SSR profile page, the client island, the list detail — inherits the
-- rule from the viewer's session with zero query changes. Service-role writers
-- (screenshot persistence, tagging) bypass RLS and are unaffected. The search
-- RPCs already filter `is_private = false` explicitly; with RLS they're
-- double-covered, which is harmless.
--
-- Drop whatever SELECT policies exist by name lookup rather than guessing the
-- name (001 predates the repo's migration files and the exact name isn't
-- recorded anywhere).
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'bookmarks' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.bookmarks', p.policyname);
  end loop;
end $$;

create policy "bookmarks readable unless private"
  on public.bookmarks for select
  using (not is_private or user_id = auth.uid());
