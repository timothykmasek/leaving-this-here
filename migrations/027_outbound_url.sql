-- Curator's custom outbound link (affiliate codes etc). The canonical `url`
-- stays untouched — dedupe (url_key), embeddings, tags, and screenshots all
-- key off it; this column only changes where a CLICK goes. Render-time code
-- (lib/outboundUrl.ts) prefers it over the utm-decorated canonical url and
-- appends NO bulletin utms to it — an affiliate link is the curator's own
-- tracking, not ours to decorate.
alter table bookmarks add column if not exists outbound_url text;
