-- Add jsonb `links` column to profiles for social links (twitter/linkedin/website).
-- Run this in the Supabase SQL editor for project ref `xtnqvjaexkztcrriotjj`.

alter table profiles
  add column if not exists links jsonb not null default '{}'::jsonb;

-- No RLS change needed — existing "profiles are readable/writable by owner"
-- policies cover the new column automatically.
