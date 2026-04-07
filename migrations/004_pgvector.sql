-- Semantic search via pgvector + Voyage AI embeddings.
-- Run this in the Supabase SQL editor for project ref `xtnqvjaexkztcrriotjj`.
--
-- This adds:
--   1. The pgvector extension
--   2. An `embedding` column on `bookmarks` (voyage-3-lite returns 1024 dims)
--   3. An HNSW index for fast cosine similarity
--   4. A `match_bookmarks` RPC that takes a query embedding + a user_id and
--      returns that user's bookmarks ranked by semantic similarity.

create extension if not exists vector;

alter table bookmarks
  add column if not exists embedding vector(1024);

-- HNSW is faster than ivfflat for small-to-medium datasets and requires no
-- pre-training. cosine distance because that's what Voyage's docs recommend.
create index if not exists bookmarks_embedding_hnsw_idx
  on bookmarks
  using hnsw (embedding vector_cosine_ops);

-- RPC: semantic search within a single user's bookmarks.
-- Respects the `is_private` flag: if `include_private` is false, private
-- bookmarks are excluded (used when a non-owner is viewing a profile).
create or replace function match_bookmarks(
  query_embedding vector(1024),
  target_user_id uuid,
  include_private boolean default false,
  match_threshold float default 0.3,
  match_count int default 50
)
returns table (
  id uuid,
  url text,
  title text,
  description text,
  image_url text,
  screenshot_url text,
  favicon_url text,
  tags text[],
  is_private boolean,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    b.id,
    b.url,
    b.title,
    b.description,
    b.image_url,
    b.screenshot_url,
    b.favicon_url,
    b.tags,
    b.is_private,
    b.created_at,
    1 - (b.embedding <=> query_embedding) as similarity
  from bookmarks b
  where b.user_id = target_user_id
    and b.embedding is not null
    and (include_private or b.is_private = false)
    and 1 - (b.embedding <=> query_embedding) > match_threshold
  order by b.embedding <=> query_embedding
  limit match_count;
$$;
