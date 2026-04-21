-- Migration 007: RPCs that power the digest cron job
--
-- Cron runs daily, calls `folio_digests_due` to find subscribers whose
-- condition is met (>= 10 new links OR >= 30 days since last digest, AND
-- at least one link to ship). For each, it sends the email and then calls
-- `folio_digest_mark_sent` to stamp `last_digest_at`.
--
-- Both RPCs are SECURITY DEFINER so the cron runs under anon + CRON_SECRET
-- without needing a service-role key.

create or replace function public.folio_digests_due(
  p_min_links int default 10,
  p_min_days int default 30
)
returns table (
  subscriber_id uuid,
  subscriber_email text,
  subscriber_unsubscribe_token text,
  owner_id uuid,
  owner_username text,
  owner_display_name text,
  anchor_at timestamptz,
  new_link_count int
)
language sql
security definer
stable
set search_path = public
as $$
  with active as (
    select s.id, s.email, s.unsubscribe_token, s.owner_id,
           coalesce(s.last_digest_at, s.confirmed_at, s.created_at) as anchor_at
    from public.folio_subscribers s
    where s.confirmed_at is not null
      and s.unsubscribed_at is null
  ),
  with_counts as (
    select a.id, a.email, a.unsubscribe_token, a.owner_id, a.anchor_at,
           (select count(*)::int from public.bookmarks b
            where b.user_id = a.owner_id
              and b.is_private = false
              and b.created_at > a.anchor_at) as new_link_count,
           extract(epoch from now() - a.anchor_at) / 86400 as days_since
    from active a
  )
  select wc.id as subscriber_id,
         wc.email as subscriber_email,
         wc.unsubscribe_token as subscriber_unsubscribe_token,
         wc.owner_id,
         p.username as owner_username,
         p.display_name as owner_display_name,
         wc.anchor_at,
         wc.new_link_count
  from with_counts wc
  join public.profiles p on p.id = wc.owner_id
  where wc.new_link_count >= 1
    and (wc.new_link_count >= p_min_links or wc.days_since >= p_min_days);
$$;

create or replace function public.folio_digest_mark_sent(p_subscriber_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.folio_subscribers
  set last_digest_at = now()
  where id = p_subscriber_id;
$$;

grant execute on function public.folio_digests_due(int, int) to anon, authenticated;
grant execute on function public.folio_digest_mark_sent(uuid) to anon, authenticated;
