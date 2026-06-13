-- Migration 010: list descriptions
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Adds an optional description to each list. Used on the public list page
-- for SEO and as a way to explain the list's purpose. Generated from the
-- user's bio + list name on creation (via Haiku), and editable inline.

alter table public.lists add column if not exists description text;
