-- Migration 009: publishable lists — stable per-list slug
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Every list becomes addressable at /username/<slug>. The slug is minted once
-- from the list name at creation and then frozen — renaming a list changes its
-- display `name` but never its `slug`, so shared URLs never break.
--
-- The app supplies `slug` on insert going forward; this migration backfills
-- slugs for any lists created before 009 by slugifying their name and
-- de-duplicating per owner.

alter table public.lists add column if not exists slug text;

-- Backfill existing rows: lowercase, non-alphanumerics → hyphens, trimmed.
-- Empty results (a name of only symbols) fall back to "list". Collisions within
-- one owner get a numeric suffix (-2, -3, ...) ordered by creation time.
with ranked as (
  select
    id,
    nullif(
      trim(both '-' from regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '-', 'g')),
      ''
    ) as base,
    row_number() over (
      partition by
        user_id,
        nullif(trim(both '-' from regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '-', 'g')), '')
      order by created_at, id
    ) as rn
  from public.lists
  where slug is null
)
update public.lists l
set slug = coalesce(r.base, 'list') || case when r.rn > 1 then '-' || r.rn::text else '' end
from ranked r
where l.id = r.id;

-- Every list now has a slug; enforce it and keep it unique per owner.
alter table public.lists alter column slug set not null;

create unique index if not exists lists_user_slug_idx
  on public.lists(user_id, slug);
