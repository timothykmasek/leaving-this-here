-- Migration 005: curator note on bookmarks
-- Run in Supabase SQL editor when ready. Code falls back gracefully if
-- this column doesn't exist, so there's no ordering dependency with deploys.
--
-- A short italic note shown on folio pages under the link — the editorial
-- voice that distinguishes a curated folio from a flat bookmark list.

alter table public.bookmarks
  add column if not exists note text;

-- No index needed — notes aren't queried, only rendered.
