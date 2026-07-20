-- Migration 012: "ambient shelf" list suggestions
-- Run in the Supabase SQL editor when ready. Additive + idempotent; the app
-- degrades gracefully (empty shelf) if this RPC is missing, so there's no
-- deploy-ordering dependency.
--
-- What this powers:
--   The list page can surface OTHER links the owner already saved that fit a
--   list — so a thin "Green Energy" list (3 bullets) can grow from the 20
--   relevant links sitting unfiled in their library, one tap each.
--
-- How it works:
--   The API route computes a target vector for the list — the CENTROID of the
--   embeddings of the bullets already in it, optionally blended with the
--   embedding of the list's name/description — and passes it here. This RPC is
--   then just `match_bookmarks` with one extra clause: EXCLUDE bullets already
--   in the list. Keeping the centroid/blend math in the route (not SQL) avoids
--   pgvector's missing scalar*vector operator and keeps the weighting flexible.
--
-- Dimension note: the param is bare `vector` (no fixed dim) on purpose. The
-- live `bookmarks.embedding` column is 512-d (voyage-3-lite), NOT the 1024 the
-- original 004 migration text says; an untyped param matches whatever the
-- column is at runtime and can't drift out of sync.

create or replace function public.match_bookmarks_for_list(
  query_embedding vector,
  target_user_id uuid,
  exclude_list_id uuid,
  include_private boolean default true,
  match_threshold float default 0.55,
  match_count int default 6
)
returns table (
  id uuid,
  url text,
  title text,
  description text,
  image_url text,
  screenshot_url text,
  favicon_url text,
  card_type text,
  is_private boolean,
  created_at timestamptz,
  similarity float
)
language sql
stable
as $$
  select
    b.id,
    b.url,
    b.title,
    b.description,
    b.image_url,
    b.screenshot_url,
    b.favicon_url,
    b.card_type,
    b.is_private,
    b.created_at,
    1 - (b.embedding <=> query_embedding) as similarity
  from bookmarks b
  where b.user_id = target_user_id
    and b.embedding is not null
    and (include_private or b.is_private = false)
    and 1 - (b.embedding <=> query_embedding) > match_threshold
    -- the whole point: never re-suggest a bullet already filed here
    and not exists (
      select 1 from public.list_bookmarks lb
      where lb.list_id = exclude_list_id
        and lb.bookmark_id = b.id
    )
  order by b.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_bookmarks_for_list(vector, uuid, uuid, boolean, float, int)
  to anon, authenticated;
