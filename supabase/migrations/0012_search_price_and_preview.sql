-- =============================================================================
-- MSN — 0012 · Two gaps found during app QA
-- =============================================================================
-- Both are cases where the client physically cannot do the right thing, so the
-- fix has to be server-side.
--
--  1. Event cards can only say "Free" or "Ticketed". The web app shows
--     "From $45". `events` has no price — price lives on `ticket_types` — and
--     `search_events` did not join it, so the projection had nothing to show.
--
--  2. The conversation list has no last-message preview. `conversations`
--     carries `last_message_at` but not the body, and PostgREST cannot express
--     "newest child row per parent". The only client-side route was an N+1 on
--     every visit to the Messages tab.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · min_price_cents on the event search projection
-- -----------------------------------------------------------------------------
-- Only counts ticket types a person could actually buy right now: active, in
-- the sales window, and not sold out. An event whose only tier is sold out
-- reports null rather than a price nobody can pay.
-- -----------------------------------------------------------------------------
create or replace function event_min_price_cents(p_event uuid)
returns integer
language sql
stable
as $$
  select min(tt.price_cents)::integer
  from ticket_types tt
  where tt.event_id = p_event
    and tt.is_active
    and (tt.sales_start_at is null or tt.sales_start_at <= now())
    and (tt.sales_end_at   is null or tt.sales_end_at   >  now())
    and (tt.quantity is null or tt.quantity_sold < tt.quantity);
$$;

comment on function event_min_price_cents is
  'Cheapest currently-buyable ticket for an event, in cents. Null when nothing is on sale — which is different from free.';

-- Postgres will not let a function change its return type in place.
drop function if exists search_events(text, double precision, double precision, integer, uuid, timestamptz, integer, integer);

create function search_events(
  q          text        default null,
  near_lat   double precision default null,
  near_lng   double precision default null,
  radius_km  integer     default null,
  category   uuid        default null,
  from_date  timestamptz default null,
  limit_n    integer     default 20,
  offset_n   integer     default 0
)
returns table (
  id uuid, host_id uuid, category_id uuid, slug text, title text, summary text,
  cover_url text, delivery_mode delivery_mode, venue_name text, city text,
  region text, country_code character, latitude double precision,
  longitude double precision, starts_at timestamptz, ends_at timestamptz,
  timezone text, is_free boolean, currency character,
  min_price_cents integer,
  distance_km double precision, relevance real
)
language sql
stable
as $$
  with params as (
    select
      nullif(btrim(coalesce(search_events.q, '')), '') as term,
      case
        when search_events.near_lat is not null and search_events.near_lng is not null
        then ll_to_earth(search_events.near_lat, search_events.near_lng)
      end as origin,
      coalesce(search_events.radius_km, 50) * 1000.0 as radius_m
  ),
  matched as (
    select
      e.id, e.host_id, e.category_id, e.slug, e.title, e.summary, e.cover_url,
      e.delivery_mode, e.venue_name, e.city, e.region, e.country_code,
      case when e.hide_exact_address then null else e.latitude  end as latitude,
      case when e.hide_exact_address then null else e.longitude end as longitude,
      e.starts_at, e.ends_at, e.timezone, e.is_free, e.currency,
      event_min_price_cents(e.id) as min_price_cents,
      case
        when p.origin is not null and e.latitude is not null and e.longitude is not null
        then round((earth_distance(p.origin, ll_to_earth(e.latitude, e.longitude)) / 1000.0)::numeric, 1)::double precision
      end as distance_km,
      case
        when p.term is null then 0::real
        else ts_rank(events_search_doc(e.title, e.summary, e.description),
                     websearch_to_tsquery('english', p.term))
      end as relevance
    from events e
    cross join params p
    where e.status = 'published'
      and (search_events.category  is null or e.category_id = search_events.category)
      and (search_events.from_date is null or e.starts_at >= search_events.from_date)
      and (p.term is null
           or events_search_doc(e.title, e.summary, e.description)
              @@ websearch_to_tsquery('english', p.term))
      and (p.origin is null
           or (e.latitude is not null and e.longitude is not null
               and earth_box(p.origin, p.radius_m) @> ll_to_earth(e.latitude, e.longitude)
               and earth_distance(p.origin, ll_to_earth(e.latitude, e.longitude)) <= p.radius_m))
  )
  select * from matched
  order by relevance desc, distance_km nulls last, starts_at
  limit  coalesce(search_events.limit_n, 20)
  offset coalesce(search_events.offset_n, 0);
$$;

comment on function search_events is
  'Published events by text, category, date and proximity. min_price_cents is the cheapest buyable ticket — null means nothing is currently on sale.';

-- -----------------------------------------------------------------------------
-- 2 · last-message preview on conversations
-- -----------------------------------------------------------------------------
alter table conversations
  add column if not exists last_message_preview text,
  add column if not exists last_message_sender_id uuid references profiles(id) on delete set null;

-- The trigger that already maintains last_message_at now carries the preview
-- with it, so they can never disagree.
create or replace function bump_conversation()
returns trigger
language plpgsql
as $$
begin
  update conversations
     set last_message_at       = new.created_at,
         last_message_sender_id = new.sender_id,
         -- Truncated at write time: a list row shows ~2 lines, and sending the
         -- whole body to render 80 characters is wasted bandwidth on every
         -- visit to the Messages tab.
         last_message_preview  = case
                                   when new.body is not null then left(new.body, 140)
                                   else '📎 Attachment'
                                 end
   where id = new.conversation_id;
  return new;
end;
$$;

comment on column conversations.last_message_preview is
  'Denormalised from messages by the bump_conversation trigger. Lets the conversation list render without an N+1 — PostgREST cannot express newest-child-per-parent.';

-- Backfill anything that already exists.
update conversations c
   set last_message_preview  = sub.preview,
       last_message_sender_id = sub.sender_id
  from (
    select distinct on (m.conversation_id)
           m.conversation_id,
           case when m.body is not null then left(m.body, 140) else '📎 Attachment' end as preview,
           m.sender_id
    from messages m
    where m.deleted_at is null
    order by m.conversation_id, m.created_at desc
  ) sub
 where c.id = sub.conversation_id
   and c.last_message_preview is null;
