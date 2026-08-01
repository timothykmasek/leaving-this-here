-- 016_perf_indexes.sql
-- Speed indexes for the app's two hottest read paths. Both are additive and
-- non-destructive (IF NOT EXISTS). On a production table with live write traffic,
-- prefer the CONCURRENTLY variants (commented below) and run them one statement
-- at a time, OUTSIDE a transaction — the Supabase SQL editor wraps a multi-
-- statement run in one transaction, which CONCURRENTLY forbids.

-- 1) The single most common query shape in the app:
--      select ... from bookmarks where user_id = $1 order by created_at desc limit N
--    It runs on the profile grid (app/[username]/page.tsx), the extension finds
--    pagination, ProfileClient's full-collection load, and the digest cron.
--    Without a (user_id, created_at) composite, Postgres reads the user's whole
--    partition and sorts it every time. This composite turns those into an
--    index-ordered top-N (read N rows, no separate sort).
create index if not exists bookmarks_user_created_idx
  on bookmarks (user_id, created_at desc);
-- production (live traffic) alternative:
--   create index concurrently if not exists bookmarks_user_created_idx
--     on bookmarks (user_id, created_at desc);

-- 2) profiles.username is looked up via .eq('username').single() on the profile
--    page, the list page, both generateMetadata blocks, opengraph-image, and
--    /api/username-check — several times per navigation. A unique index both
--    speeds the lookup (no seq scan proving uniqueness) and enforces the
--    one-handle-per-username invariant the app already assumes.
--
--    BEFORE RUNNING: check whether a unique constraint on username already exists
--    (it may have been created in the original table DDL, which lives in Supabase,
--    not this repo):
--      select indexname, indexdef from pg_indexes
--      where tablename = 'profiles' and indexdef ilike '%username%';
--    If one already exists, skip this statement (the IF NOT EXISTS below only
--    guards against a duplicate of THIS index name, not a differently-named one).
--
--    If usernames are ever matched case-insensitively, use the lower() form
--    instead: create unique index ... on profiles (lower(username));
create unique index if not exists profiles_username_key
  on profiles (username);
