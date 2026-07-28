-- Migration 014: normalized dedupe key on bookmarks (url_key)
--
-- The old guard (migration 011) is a unique index on the EXACT url string
-- (user_id, url). It only catches byte-identical re-saves, so near-duplicates
-- slip through and produce two cards for what is really the same page:
--   https://site.com  vs  https://www.site.com  vs  https://site.com/?utm_source=x
--
-- `url_key` holds a normalized form of the URL (see lib/normalizeUrl.ts): https,
-- no www, no trailing slash, tracking params stripped, query sorted. Save paths
-- look a bullet up by (user_id, url_key) and refresh it in place instead of
-- inserting a twin. The original `url` is untouched — it stays exactly what the
-- user saved and clicks through to.
--
-- Enforcement stays at the app level for now (SELECT-then-insert), so this index
-- is non-unique. A UNIQUE index would be stricter but can't be built while any
-- existing near-dupes remain in the table; that's a future cleanup, not this
-- migration.
--
-- Run this in the Supabase SQL editor, then run scripts/backfill-url-key.mjs to
-- populate url_key for existing rows, then deploy the code that reads/writes it.

ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS url_key text;

CREATE INDEX IF NOT EXISTS bookmarks_user_urlkey_idx
  ON bookmarks (user_id, url_key);
