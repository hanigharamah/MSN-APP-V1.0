-- search_events: delivery mode, free-only and a price range.
--
-- ## The bug this fixes, not just the feature it adds
--
-- Discover has two read paths — `listEvents` for a plain browse and this
-- function once there is a text query or a location — and they honoured
-- DIFFERENT filters. `listEvents` applied "free only" and delivery mode and
-- ignored proximity; `search_events` applied proximity and ignored the other
-- two. So turning on "Free" and then typing a word silently switched the free
-- filter off, and the catalogue answered two different questions depending on
-- whether the search box happened to be empty.
--
-- Adding the filters here is what lets the client pass the same set to both.
--
-- ## Price
--
-- Bounds are compared against `event_min_price_cents`, the cheapest ticket
-- currently ON SALE — the same number the card shows as "From £65". Filtering
-- on anything else would mean a card that says £65 disappearing from a
-- £50–£100 band.
--
-- A free event has no priced ticket and so has a null minimum. Nulls are kept
-- when only an upper bound is set (free is unambiguously under any ceiling)
-- and dropped when a floor is set, because "at least £20" cannot include
-- something that costs nothing.

drop function if exists search_events(text, double precision, double precision, integer, uuid, timestamptz, integer, integer);

create function search_events(
  q          text        default null,
  near_lat   double precision default null,
  near_lng   double precision default null,
  radius_km  integer     default null,
  category   uuid        default null,
  from_date  timestamptz default null,
  -- Array rather than a single value: "online or in person" is a real request,
  -- and the alternative is the client firing one query per mode and merging.
  delivery   delivery_mode[] default null,
  free_only  boolean     default false,
  min_price  integer     default null,
  max_price  integer     default null,
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
      and (search_events.delivery  is null or e.delivery_mode = any(search_events.delivery))
      and (not coalesce(search_events.free_only, false) or e.is_free)
      -- A floor excludes free events; a ceiling keeps them. See the header.
      and (search_events.min_price is null
           or event_min_price_cents(e.id) >= search_events.min_price)
      and (search_events.max_price is null
           or coalesce(event_min_price_cents(e.id), 0) <= search_events.max_price)
      and (p.term is null
           or events_search_doc(e.title, e.summary, e.description)
              @@ websearch_to_tsquery('english', p.term))
      and (p.origin is null
           or (e.latitude is not null and e.longitude is not null
               and earth_box(p.origin, p.radius_m) @> ll_to_earth(e.latitude, e.longitude)
               and earth_distance(p.origin, ll_to_earth(e.latitude, e.longitude)) <= p.radius_m))
  )
  select * from matched
  order by relevance desc, distance_km nulls last, starts_at, id
  limit  coalesce(search_events.limit_n, 20)
  offset coalesce(search_events.offset_n, 0);
$$;

comment on function search_events is
  'Published events by text, category, date, proximity, delivery mode, free-only and price band. min_price_cents is the cheapest buyable ticket — null means nothing is currently on sale.';
