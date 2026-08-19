-- search_events: return the host, not just their id.
--
-- MSN is a marketplace built on people — a seeker chooses a breathwork circle
-- because of who is running it. The event card showed title, date and place and
-- never said whose it was, so the single most decisive fact was the one the
-- browse list omitted.
--
-- The browse path could already show it (`listEvents` embeds the host through
-- PostgREST), but search returned `host_id` alone. Rendering the host on one
-- path and not the other is worse than neither: the card visibly loses
-- information the moment you type in the search box.
--
-- Joined here rather than fetched per row on the client. Twenty results would
-- be twenty extra round trips, and `search_providers` was already reworked the
-- same way in 0014 for the same reason — it measured ~16x faster inline.
--
-- `left join`, not `join`: an event whose host row is missing or unreadable
-- must still appear. Dropping listings from search because of a join is a far
-- worse failure than a card with no name on it.

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
  -- The host, flattened. Named with a prefix rather than returned as a
  -- composite so the client keeps one flat row type per result.
  host_display_name text, host_handle text, host_avatar_url text,
  host_is_verified boolean,
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
      h.display_name as host_display_name,
      h.handle       as host_handle,
      h.avatar_url   as host_avatar_url,
      -- Verified drives a badge on the card. `coalesce` so a missing host row
      -- reads as "not verified" rather than null, which would render as an
      -- absent badge either way but makes the boolean honest.
      coalesce(h.is_verified, false) as host_is_verified,
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
    left join profiles h on h.id = e.host_id
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
  -- `id` last makes the ordering total. Without it, LIMIT/OFFSET paging over
  -- tied rows can repeat or skip one.
  order by relevance desc, distance_km nulls last, starts_at, id
  limit  coalesce(search_events.limit_n, 20)
  offset coalesce(search_events.offset_n, 0);
$$;

comment on function search_events is
  'Published events by text, category, date and proximity, with the host joined in. Ordering is total (id last) so OFFSET paging cannot duplicate a row. min_price_cents null means nothing is currently on sale.';
