-- =============================================================================
-- MSN — 0014 · Deterministic paging, and make provider search pageable
-- =============================================================================
-- Two findings from the Discover QA pass.
--
-- 1. NO UNIQUE TIEBREAKER IN THE ORDER BY.
--    `search_events` orders by `relevance desc, distance_km, starts_at`. Rows
--    tying on all three have no guaranteed order between two separate
--    statements, so a row on a LIMIT/OFFSET boundary can appear on both page 1
--    and page 2 — a duplicate React key and a listing shown twice. Appending
--    `id` makes the order total, which is what makes OFFSET paging sound.
--
-- 2. `search_providers` TAKES limit_n BUT NO offset_n.
--    So it cannot page, which is why the client used a plain PostgREST query
--    instead and then fetched each provider's rating individually. Measured on
--    this project for one page of 20:
--
--        20 × provider_rating, serialised   20 requests   6.2 s
--        20 × provider_rating, 10 parallel  20 requests   1.1 s
--        one search_providers, inline       1 request     0.38 s
--
--    ~16×. The ratings are already in the projection; it only needed paging.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · search_events — total ordering
-- -----------------------------------------------------------------------------
create or replace function search_events(
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
  -- `id` last makes the ordering total. Without it, LIMIT/OFFSET paging over
  -- tied rows can repeat or skip one.
  order by relevance desc, distance_km nulls last, starts_at, id
  limit  coalesce(search_events.limit_n, 20)
  offset coalesce(search_events.offset_n, 0);
$$;

comment on function search_events is
  'Published events by text, category, date and proximity. Ordering is total (id last) so OFFSET paging cannot duplicate a row. min_price_cents null means nothing is currently on sale.';

-- -----------------------------------------------------------------------------
-- 2 · search_providers — add offset_n, and a total ordering
-- -----------------------------------------------------------------------------
drop function if exists search_providers(text, uuid, double precision, double precision, integer, integer);

create function search_providers(
  q          text default null,
  speciality uuid default null,
  near_lat   double precision default null,
  near_lng   double precision default null,
  radius_km  integer default null,
  limit_n    integer default 20,
  offset_n   integer default 0
)
returns table (
  id uuid, handle citext, display_name text, headline text, avatar_url text,
  cover_url text, account_type account_type, city text, region text,
  country_code character, latitude double precision, longitude double precision,
  is_verified boolean, is_certified boolean,
  rating_average numeric, rating_count bigint,
  distance_km double precision, relevance real
)
language sql
stable
as $$
  with params as (
    select
      nullif(btrim(coalesce(search_providers.q, '')), '') as term,
      case
        when search_providers.near_lat is not null and search_providers.near_lng is not null
        then ll_to_earth(search_providers.near_lat, search_providers.near_lng)
      end as origin,
      coalesce(search_providers.radius_km, 50) * 1000.0 as radius_m
  ),
  matched as (
    select
      pr.id, pr.handle, pr.display_name, pr.headline, pr.avatar_url, pr.cover_url,
      pr.account_type, pr.city, pr.region, pr.country_code,
      case when pr.hide_exact_location then null else pr.latitude  end as latitude,
      case when pr.hide_exact_location then null else pr.longitude end as longitude,
      pr.is_verified, pr.is_certified,
      r.average as rating_average,
      r.total   as rating_count,
      case
        when p.origin is not null and pr.latitude is not null and pr.longitude is not null
        then round((earth_distance(p.origin, ll_to_earth(pr.latitude, pr.longitude)) / 1000.0)::numeric, 1)::double precision
      end as distance_km,
      case
        when p.term is null then 0::real
        else ts_rank(profiles_search_doc(pr.display_name, pr.headline, pr.bio),
                     websearch_to_tsquery('english', p.term))
      end as relevance
    from profiles pr
    cross join params p
    left join lateral provider_rating(pr.id) r on true
    where pr.account_type <> 'seeker'
      and not pr.is_suspended
      and (search_providers.speciality is null
           or exists (select 1 from profile_specialities ps
                      where ps.profile_id = pr.id
                        and ps.speciality_id = search_providers.speciality))
      and (p.term is null
           or profiles_search_doc(pr.display_name, pr.headline, pr.bio)
              @@ websearch_to_tsquery('english', p.term))
      and (p.origin is null
           or (pr.latitude is not null and pr.longitude is not null
               and earth_box(p.origin, p.radius_m) @> ll_to_earth(pr.latitude, pr.longitude)
               and earth_distance(p.origin, ll_to_earth(pr.latitude, pr.longitude)) <= p.radius_m))
  )
  select * from matched
  order by relevance desc, is_verified desc, distance_km nulls last, display_name, id
  limit  coalesce(search_providers.limit_n, 20)
  offset coalesce(search_providers.offset_n, 0);
$$;

comment on function search_providers is
  'Practitioners by text, speciality and proximity. Ratings are joined inline — calling provider_rating per card instead was ~16x slower for a page of 20. Ordering is total (id last) so OFFSET paging is deterministic.';
