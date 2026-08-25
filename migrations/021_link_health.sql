-- Link rot: somewhere to record what we found. Run in the Supabase SQL editor.
--
-- WHY THESE THREE COLUMNS
--
-- link_checked_at   when we last asked. Drives the sweep order (oldest first)
--                   and the cadence; without it the sweeper cannot know what
--                   it has already done.
-- link_status       what we found, NOT whether the link is dead. 'blocked' is
--                   deliberately its own value: 403 and 429 mean a datacenter
--                   IP was refused, and a measurement of 150 of Tim's links
--                   found SIX of those against FOUR genuine 404s. Storing them
--                   as a distinct outcome is what stops the product telling
--                   someone to delete a live link.
-- link_fail_count   consecutive failures. One bad answer is a blip; two on
--                   different days is rot. Reset to 0 by any success.
--
-- "Dead" is therefore a derived idea — status = 'gone' AND fail_count >= 2 —
-- not a flag anything sets directly. Nothing in the app should ever write
-- link_status = 'dead'.
--
-- Kept on bookmarks rather than in a table keyed by url_key. Liveness really is
-- a property of a URL and not of a user, so at scale the same URL saved by 500
-- people would be checked 500 times — but Tim's own library is 1,115 links
-- across 1,054 domains, so today the dedupe would save nothing, and a join
-- would cost something. Move it when cross-user overlap is real and measured.

alter table public.bookmarks
  add column if not exists link_checked_at timestamptz,
  add column if not exists link_status text,
  add column if not exists link_fail_count integer not null default 0;

-- The sweeper's only query: least-recently-checked first, never-checked first
-- of all. Without this it is a full scan of the table on every run.
create index if not exists bookmarks_link_checked_at_idx
  on public.bookmarks (link_checked_at nulls first);

-- Reading the drawer: "gone twice" is a small slice of a large table.
create index if not exists bookmarks_link_dead_idx
  on public.bookmarks (user_id)
  where link_status = 'gone' and link_fail_count >= 2;

comment on column public.bookmarks.link_status is
  'ok | gone | blocked | error. Dead = gone AND link_fail_count >= 2. blocked (401/403/429) is NOT dead — it is a datacenter IP being refused.';
