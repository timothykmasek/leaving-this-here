-- Migration 011: Unique constraint on bookmarks (user_id, url)
--
-- Prevents duplicate saves of the same URL per user. The extension's save endpoint
-- expects this constraint to catch duplicates via PostgreSQL error 23505 and return
-- a 409 conflict.

CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_user_url_idx
  ON bookmarks (user_id, url);
