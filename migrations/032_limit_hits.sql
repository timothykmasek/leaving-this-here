-- One row each time a save or import is refused by a limit (lib/saveLimits,
-- lib/importQuota). A refused save never becomes a bookmark, so without this
-- table there'd be no trace of who is pushing against the free plan — the
-- clearest signal of who might pay for Pro.
--   door:  'extension' | 'ios' | 'web' | 'claude' | 'import' | 'unknown'
--   limit: 'daily' (100 everyday saves / 24h) | 'add_bullet_daily' (20)
--          | 'claude_daily' (50) | 'import_allowance' (500 per account)
-- Written only by the service role; RLS on with no policies keeps it private.
create table if not exists limit_hits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  door text not null,
  limit_name text not null,
  created_at timestamptz not null default now()
);
alter table limit_hits enable row level security;
create index if not exists limit_hits_user_idx on limit_hits (user_id, created_at desc);

-- The rate-limit counts look at one account's last 24h of saves on every save.
create index if not exists bookmarks_user_created_idx on bookmarks (user_id, created_at desc);
