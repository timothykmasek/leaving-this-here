-- Card image preference for CONTESTED bare links — a homepage (card_type =
-- 'screenshot') that has BOTH a designed og AND a stored screenshot, so there's a
-- real choice about which makes the better card. Set once at persist time by the
-- vision judge (lib/cardImageJudge); honoured by cardImageCandidates (lib/cardImage)
-- ahead of the default card-type routing. NULL = no decision → default routing.
--   'og'         → show the og share-image first
--   'screenshot' → show the rendered-page screenshot first
alter table bookmarks add column if not exists image_pref text;
