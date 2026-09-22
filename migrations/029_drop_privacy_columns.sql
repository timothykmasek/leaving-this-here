-- 029: drop what 028 retired. Run ONLY after the deploy that stops selecting
-- these columns (lists.is_private in the profile/list pages, MCP, sitemap;
-- bookmarks.pinned_at in the profile ordering). Running it early 400s those
-- reads until the deploy lands.
--
-- lists.is_private: lists are always public (028 §3).
-- bookmarks.pinned_at: the pin control was removed with the visibility toggle
-- (Tim, 2026-09-22) — two pins existed in prod.

alter table public.lists drop column if exists is_private;

drop index if exists public.bookmarks_pinned_idx;
alter table public.bookmarks drop column if exists pinned_at;
