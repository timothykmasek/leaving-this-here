-- 030: drop lists.description. Run ONLY after the deploy that stops selecting
-- it (profile + list pages, lib/queries, MCP, /api/extension/lists, the
-- suggestions route). Running it early 400s every list read until the deploy
-- lands.
--
-- Nothing displayed it: the list masthead retired descriptions, the card
-- never had them, and the only writer left was a Haiku sentence minted on
-- every create (removed 2026-09-22, with the in-page editor). What survived
-- was a meta tag and an MCP field — not worth a column, a round trip, or the
-- credits. A list is its name and its bullets. (Tim, 2026-09-22.)

alter table public.lists drop column if exists description;
