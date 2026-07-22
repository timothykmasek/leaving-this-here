-- OPTIONAL speed upgrade for the ambient shelf (list suggestions).
--
-- The app works WITHOUT this: /api/lists/[id]/suggestions ranks in-route by
-- pulling the owner's embeddings (~7MB for a 1k-bookmark library) and scoring
-- in JS. Pasting this once into the Supabase SQL editor moves that ranking
-- into Postgres (indexed pgvector scan, returns ~6 rows / ~10KB), cutting the
-- shelf's first-load from seconds to a few hundred ms. The route detects the
-- function automatically — no code change or deploy needed, and it falls back
-- to the JS path if this is ever dropped.
--
-- Dimension note: the param is bare `vector` (no fixed dim) on purpose. The
-- live `bookmarks.embedding` column is 512-d (voyage-3-lite); an untyped param
-- matches whatever the column is at runtime and can't drift out of sync.

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
