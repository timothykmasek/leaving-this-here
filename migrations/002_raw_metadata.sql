-- Migration 002: raw_metadata insurance layer
--
-- Adds a JSONB column to store the full raw HTML metadata extraction
-- (og:*, twitter:*, JSON-LD, <title>, <h1>, icons) alongside each bookmark.
--
-- After this, any future change to title/image selection logic can be
-- re-applied over stored data with zero network calls (run backfill-images
-- with mode='reclassify').
--
-- Also updates backfill_bookmark RPC to accept new_raw_metadata.

-- 1. Column
ALTER TABLE bookmarks
  ADD COLUMN IF NOT EXISTS raw_metadata JSONB;

-- 2. RPC function (overwrites the existing one — signature compatible,
--    new param is nullable with default so existing callers still work).
CREATE OR REPLACE FUNCTION backfill_bookmark(
  bookmark_id UUID,
  new_card_type TEXT DEFAULT NULL,
  new_image_url TEXT DEFAULT NULL,
  new_screenshot_url TEXT DEFAULT NULL,
  new_favicon_url TEXT DEFAULT NULL,
  new_title TEXT DEFAULT NULL,
  new_description TEXT DEFAULT NULL,
  new_raw_metadata JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE bookmarks SET
    card_type     = COALESCE(new_card_type,     card_type),
    image_url     = COALESCE(new_image_url,     image_url),
    screenshot_url = COALESCE(new_screenshot_url, screenshot_url),
    favicon_url   = COALESCE(new_favicon_url,   favicon_url),
    title         = COALESCE(new_title,         title),
    description   = COALESCE(new_description,   description),
    raw_metadata  = COALESCE(new_raw_metadata,  raw_metadata)
  WHERE id = bookmark_id;
END;
$$;

-- 3. Grant execute on the updated function (RLS bypass via SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION backfill_bookmark(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB
) TO anon, authenticated;
