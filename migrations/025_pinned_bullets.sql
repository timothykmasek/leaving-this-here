-- Pin bullets to the top of a profile.
--
-- NULL = not pinned. A timestamp rather than a boolean so multiple pins have
-- an order: most recently pinned first, ahead of the reverse-chron feed.
-- No CHECK constraint (see migration 015's lesson) — the app owns the shape.
alter table bookmarks add column if not exists pinned_at timestamptz;

-- Partial index: the profile query orders by (pinned_at desc nulls last,
-- created_at desc) per user, and only pinned rows ever match the first key.
create index if not exists bookmarks_pinned_idx
  on bookmarks (user_id, pinned_at desc)
  where pinned_at is not null;
