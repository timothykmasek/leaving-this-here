-- "Keep" needs somewhere to live. Run in the Supabase SQL editor.
--
-- Without this, Keep is a lie. The sweeper re-checks a failing link every three
-- days, finds it gone again, and the drawer offers it back — so saying "I know,
-- and I want it anyway" would buy three days of silence and then start nagging
-- again forever.
--
-- Deliberately NOT done by changing link_status. The link IS gone; recording it
-- as 'ok' to make the drawer quiet would put a false fact in the column the
-- sweeper reasons from. This says something different and true: the owner has
-- seen this one and made a decision.
--
-- A timestamp rather than a boolean because it answers "when did they decide",
-- which is the question you actually want later — e.g. if the URL ever starts
-- answering again, a dismissal from two years ago should probably not still be
-- suppressing it.

alter table public.bookmarks
  add column if not exists link_kept_at timestamptz;

-- The drawer's query: dead, and not already answered for.
drop index if exists bookmarks_link_dead_idx;
create index if not exists bookmarks_link_dead_idx
  on public.bookmarks (user_id)
  where link_status = 'gone' and link_fail_count >= 2 and link_kept_at is null;

comment on column public.bookmarks.link_kept_at is
  'Owner pressed Keep on a dead link. Suppresses it from the dead-links drawer; does NOT change link_status, which stays truthful.';
