-- Migration 015: drop the bookmarks_card_type_check constraint.
--
-- classifyCardType() (lib/cardType.ts) started emitting card types the DB CHECK
-- constraint didn't allow — 'tweet' (Jul 22, commit ea66bba), then 'login' and
-- 'cart' (Jul 26, hygiene gate). Every save classified as one of those failed
-- its INSERT with 23514 on BOTH the import path and the extension, silently:
-- createBookmarkFromUrl discarded the error and the import UI showed "already
-- there". Tweets, for example, hadn't saved at all since Jul 22.
--
-- The constraint was redundant: card_type is written only by classifyCardType,
-- whose return type is already a TypeScript union — nothing user-supplied ever
-- reaches this column. A CHECK here can't prevent bad data, only reject our own
-- valid new types. So drop it and let the type system own the enum. (The import
-- path now also surfaces insert errors instead of masking them — see the
-- "surface real save failures" commit — so a future drift fails loudly.)

ALTER TABLE bookmarks DROP CONSTRAINT IF EXISTS bookmarks_card_type_check;
