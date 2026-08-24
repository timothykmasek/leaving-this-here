-- Migration 019: list cover images
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Adds an optional cover photo to each list. A list is a publication, and the
-- cover is its masthead — but it stays OPTIONAL by design: null is a real,
-- first-class state the owner can choose (and return to), not just the state a
-- list sits in before someone gets round to it. The list page renders a
-- deliberate no-cover masthead rather than a placeholder or an empty frame.
--
-- Stores the public CDN URL, not a storage path, matching how bookmarks hold
-- image_url / screenshot_url. Bytes live in the existing `card-images` bucket
-- under `covers/<listId>.webp`, so this needs no new bucket or storage policy.
--
-- No backfill: existing lists are simply coverless until their owner picks one.

alter table public.lists add column if not exists cover_image_url text;
