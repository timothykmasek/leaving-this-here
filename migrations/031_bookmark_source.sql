-- Where a bullet came from: 'extension' | 'ios' | 'web' (single "Add Bullet")
-- | 'import' (a bulk import run) | 'onboarding' | 'claude' (the connector).
-- NULL = saved before this column existed, or a caller we couldn't identify. Two jobs:
--   1. Cost: ScreenshotOne spend depends on the save mix (the extension brings
--      its own screenshot; iOS, web and imports don't).
--   2. The free import allowance counts source = 'import' rows (lib/importQuota).
-- No CHECK constraint on purpose: the TS union owns the values (a stale CHECK
-- once silently dropped saves for six days — see migration 015).
alter table bookmarks add column if not exists source text;

-- The import-quota count runs per import request; keep it an index lookup.
create index if not exists bookmarks_user_import_idx
  on bookmarks (user_id) where source = 'import';
