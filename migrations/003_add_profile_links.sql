-- Add profile links (twitter / linkedin / website) as JSONB
-- This was missing, causing profile bio + links saves to silently fail.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS links jsonb DEFAULT '{}'::jsonb;
