-- Speed + correctness for the ambient shelf. Run in the Supabase SQL editor.
--
-- WHY
--
-- Opening a collection made the shelf's endpoint do ~1.1s of database work,
-- measured on Tim's biggest list (AI tools, 146 members):
--
--   786ms / 899KB  fetch the embedding of EVERY member of the list
--   322ms /   4KB  the pgvector similarity scan
--
-- That 899KB exists only to be averaged into one 512-float centroid in
-- JavaScript, and then thrown away. Postgres can do the averaging where the
-- vectors already live, so nothing but the answer crosses the wire.
--
-- This function takes a LIST, not a pre-computed vector: it derives the
-- centroid, the owner and the exclusions itself. One round trip, ~4KB.
--
-- match_bookmarks_for_list (migration 012) stays for the name-weighted path,
-- where the caller genuinely does blend a name embedding into the target and
-- so has to pass a vector in.
--
-- SECURITY INVOKER (the default for a plain sql function) — RLS on bookmarks
-- and list_bookmarks applies to whoever calls it, exactly as it does for the
-- existing function. The owner is derived from the list rather than trusted
-- from a parameter.
--
-- NOTE ON avg(): pgvector has supported avg() on vectors since 0.5.0. If your
-- instance is older this will fail with "function avg(vector) does not exist",
-- and nothing else changes — it's a create-function statement, no data is
-- touched.

create or replace function public.suggest_for_list(
  p_list_id uuid,
  match_threshold float default 0.55,
  match_count int default 12
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
  image_pref text,
  is_private boolean,
  note text,
  created_at timestamptz,
  custom_image text,
  similarity float
)
language sql
stable
as $$
  with ctx as (
    select
      l.user_id as owner_id,
      (
        select avg(b.embedding)::vector
        from public.list_bookmarks lb
        join public.bookmarks b on b.id = lb.bookmark_id
        where lb.list_id = p_list_id
          and b.embedding is not null
      ) as centroid
    from public.lists l
    where l.id = p_list_id
  )
  select
    b.id,
    b.url,
    b.title,
    b.description,
    b.image_url,
    b.screenshot_url,
    b.favicon_url,
    b.card_type,
    -- image_pref, note and the owner's own picture ride along because the
    -- shelf's cards render and OPEN like any other bullet. Without note the
    -- detail modal shows an empty field for a bookmark that has one, and
    -- overwrites it on save; without image_pref the card can pick the wrong
    -- image. The route's JS fallback selects all three, so every engine has to
    -- agree or the shelf quietly changes depending on which one ran.
    b.image_pref,
    b.is_private,
    b.note,
    b.created_at,
    b.raw_metadata->>'customImage' as custom_image,
    1 - (b.embedding <=> ctx.centroid) as similarity
  from public.bookmarks b, ctx
  where ctx.centroid is not null
    and b.user_id = ctx.owner_id
    and b.embedding is not null
    and 1 - (b.embedding <=> ctx.centroid) > match_threshold
    -- never re-suggest something already filed here
    and not exists (
      select 1 from public.list_bookmarks lb
      where lb.list_id = p_list_id
        and lb.bookmark_id = b.id
    )
  order by b.embedding <=> ctx.centroid
  limit match_count;
$$;

grant execute on function public.suggest_for_list(uuid, float, int)
  to anon, authenticated;
