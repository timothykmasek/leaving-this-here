-- 017_search_keywords.sql
--
-- Embed-only search keywords. A one-word English query ("hat") missed the
-- French bucket-hat bookmark ("Chapeau Isaho…") entirely: voyage-3-lite doesn't
-- bridge "hat" → "chapeau" (measured cosine 0.22, far under the 0.4 gate), and
-- the client substring fallback can't match "hat" inside "chapeau" either.
--
-- Fix: at save time, Claude Haiku generates a compact line of English search
-- keywords (object type, category, synonyms, translated foreign nouns, brand)
-- and we fold it into the embedded text. This is a SEARCH signal only — never
-- shown to users — and is deliberately separate from the retired user-facing
-- `tags`.
--
-- After applying this, run scripts/backfill-keywords.mjs to enrich + re-embed
-- the existing rows.

alter table bookmarks add column if not exists keywords text;

comment on column bookmarks.keywords is
  'Embed-only English search keywords (Haiku-generated). Folded into the '
  'embedded text to improve recall; never rendered in the UI.';
