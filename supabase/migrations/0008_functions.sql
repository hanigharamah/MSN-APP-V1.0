-- =============================================================================
-- MSN — 0008 · Application functions
-- =============================================================================
-- Everything here is callable over PostgREST as `rpc/<name>`. Parameter names
-- are therefore part of the public API — supabase-js passes arguments by name,
-- so renaming a parameter is a breaking change even though the SQL still works.
--
-- Default posture is `stable` + `security invoker` so RLS from 0006 still
-- applies. available_slots is the one exception and says why at its definition.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Full-text search documents
-- -----------------------------------------------------------------------------
-- These exist so the GIN index and the WHERE clause use byte-identical
-- expressions. If the two ever drift the index is silently ignored and search
-- turns into a sequential scan over every event on the platform.
--
-- Weights: A = title/name, B = summary/headline, C = long-form body. ts_rank
-- then floats an exact title match above an incidental mention in a paragraph.

create or replace function events_search_doc(
  title       text,
  summary     text,
  description text
)
returns tsvector
language sql
immutable
parallel safe
as $$
  select setweight(pg_catalog.to_tsvector('english', coalesce(title,       '')), 'A')
      || setweight(pg_catalog.to_tsvector('english', coalesce(summary,     '')), 'B')
      || setweight(pg_catalog.to_tsvector('english', coalesce(description, '')), 'C');
$$;

comment on function events_search_doc is
  'Weighted tsvector for an event. Must be used verbatim by both events_fts_idx and search_events(), otherwise the index stops matching.';

create or replace function profiles_search_doc(
  display_name text,
  headline     text,
  bio          text
)
returns tsvector
language sql
immutable
parallel safe
as $$
  select setweight(pg_catalog.to_tsvector('english', coalesce(display_name, '')), 'A')
      || setweight(pg_catalog.to_tsvector('english', coalesce(headline,     '')), 'B')
      || setweight(pg_catalog.to_tsvector('english', coalesce(bio,          '')), 'C');
$$;

comment on function profiles_search_doc is
  'Weighted tsvector for a profile. Paired with profiles_fts_idx and search_providers().';

create index if not exists events_fts_idx
  on events using gin (events_search_doc(title, summary, description));

create index if not exists profiles_fts_idx
  on profiles using gin (profiles_search_doc(display_name, headline, bio));

-- Provider-side booking lookups: available_slots() asks "what does this
-- provider already have between X and Y" once per call.
-- Must stay in step with LIVE_BOOKING_STATUSES in functions/book-service — see
-- the note at available_slots().
create index if not exists bookings_provider_window_idx
  on bookings (provider_id, starts_at)
  where status in ('requested', 'confirmed', 'completed');

-- =============================================================================
-- available_slots
-- =============================================================================
-- Returns the bookable start times for one service over a date range.
--
-- WHY security definer (the only one in this file):
--   0006 restricts `availability_blocks` to the provider themselves, and
--   `bookings` to the two parties. A seeker running this as invoker would see
--   neither, so every blocked hour and every already-taken hour would come back
--   as available and the booking would fail — or double-book — at insert time.
--   Correct slot generation is structurally impossible under invoker rights.
--
--   The function is written to leak nothing beyond that: it returns timestamps
--   only. Not the block `reason`, not who the other booking is with, not that a
--   conflict was a booking rather than a holiday. The negative information
--   ("11:00 is taken") is inherent to any booking UI.
--
-- Semantics:
--   * from_date/to_date are inclusive and are LOCAL DATES in each availability
--     rule's own timezone, which is the intuitive reading of "show me next week".
--   * Slots step by duration + buffer, so the buffer sits between consecutive
--     slots. A slot must finish inside the availability window; the trailing
--     buffer may fall outside it.
--   * Existing bookings are widened by the buffer on both sides before the
--     overlap test, so a new booking can never start inside another's cool-down.
--   * Past slots are dropped. Blocks are tested at full width, no buffer —
--     a block means "not here", not "not here plus turnaround".
--
-- Returns nothing (rather than erroring) when the service is inactive, belongs
-- to a different provider, or the provider has switched bookings off. Failing
-- closed is the right default for an availability query.

create or replace function available_slots(
  provider  uuid,
  service   uuid,
  from_date date,
  to_date   date
)
returns table (
  slot_start timestamptz,
  slot_end   timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with svc as (
    select s.id, s.provider_id, s.duration_minutes, s.buffer_minutes
    from services s
    where s.id          = available_slots.service
      and s.provider_id = available_slots.provider
      and s.is_active
      -- Provider has to be accepting bookings at all. No row here => no slots.
      and not exists (
        select 1 from provider_details pd
        where pd.profile_id = available_slots.provider
          and pd.accepts_bookings = false
      )
  ),

  -- One row per calendar day in the requested range.
  days as (
    -- Cast to timestamp explicitly: generate_series has no (date, date, interval)
    -- overload, and letting Postgres pick between the timestamp and timestamptz
    -- variants would make the day list depend on the server's TimeZone setting.
    select d::date as day
    from generate_series(
      available_slots.from_date::timestamp,
      available_slots.to_date::timestamp,
      interval '1 day'
    ) as d
  ),

  -- Expand the weekly rules across those days. `date + time` yields a naive
  -- timestamp; `at time zone <rule tz>` anchors it to a real instant, which is
  -- what makes a rule written as "Tuesdays 09:00 Europe/London" survive a DST
  -- boundary in the middle of the range.
  -- availability_rules.weekday is 0 = Sunday, matching extract(dow).
  windows as (
    select
      ((d.day + r.starts_time) at time zone r.timezone) as win_start,
      ((d.day + r.ends_time)   at time zone r.timezone) as win_end
    from days d
    join availability_rules r
      on r.provider_id = available_slots.provider
     and r.weekday     = extract(dow from d.day)::smallint
  ),

  -- Chop each window into candidate starts. generate_series' stop bound is
  -- inclusive, so stopping at (win_end - duration) is exactly the condition
  -- "the appointment finishes before the window closes".
  candidates as (
    select
      gs                                                    as slot_start,
      gs + make_interval(mins => svc.duration_minutes)       as slot_end,
      svc.buffer_minutes
    from windows w
    cross join svc
    cross join lateral generate_series(
      w.win_start,
      w.win_end - make_interval(mins => svc.duration_minutes),
      make_interval(mins => svc.duration_minutes + svc.buffer_minutes)
    ) as gs
  )

  -- distinct: two overlapping rules for the same weekday (e.g. a morning rule
  -- and an all-day rule) would otherwise emit the same start twice.
  select distinct c.slot_start, c.slot_end
  from candidates c
  where c.slot_start > now()

    -- Provider is away. out_of_office_until is a date; compared in UTC so the
    -- result does not depend on the server's timezone setting.
    and not exists (
      select 1 from provider_details pd
      where pd.profile_id = available_slots.provider
        and pd.is_out_of_office
        and (
          pd.out_of_office_until is null
          or (c.slot_start at time zone 'UTC')::date <= pd.out_of_office_until
        )
    )

    -- One-off blocks: holidays, off-platform commitments. Half-open ranges so a
    -- block ending at 12:00 does not collide with a slot starting at 12:00.
    and not exists (
      select 1 from availability_blocks b
      where b.provider_id = available_slots.provider
        and tstzrange(b.starts_at, b.ends_at, '[)')
            && tstzrange(c.slot_start, c.slot_end, '[)')
    )

    -- Existing commitments. 'requested' holds the slot too: a pending request
    -- the provider has not answered yet must not be resold underneath them.
    -- 'completed' normally cannot collide with a future slot, but a provider
    -- who closes a booking out early would otherwise free the time up.
    -- declined / cancelled_* / no_show release it.
    --
    -- This list MUST match LIVE_BOOKING_STATUSES in functions/book-service.
    -- If this one is looser, the app offers a slot that book-service then
    -- rejects with a 409 — the worst possible place to discover a mismatch.
    and not exists (
      select 1 from bookings bk
      where bk.provider_id = available_slots.provider
        and bk.status in ('requested', 'confirmed', 'completed')
        and tstzrange(
              bk.starts_at - make_interval(mins => c.buffer_minutes),
              bk.ends_at   + make_interval(mins => c.buffer_minutes),
              '[)'
            ) && tstzrange(c.slot_start, c.slot_end, '[)')
    )

  order by 1;
$$;

comment on function available_slots is
$$Bookable start times for a service between two local dates, inclusive.

  select * from available_slots(
    provider  => '<provider profile uuid>',
    service   => '<service uuid>',
    from_date => current_date,
    to_date   => current_date + 13
  );

Expands availability_rules across the range in each rule's own timezone, cuts
each window into duration+buffer steps, then removes anything in the past,
inside an availability_block, or overlapping a requested/confirmed booking
widened by the service buffer. Returns zero rows if the service is inactive,
does not belong to the provider, or the provider is not accepting bookings.

security definer by necessity: availability_blocks and bookings are invisible
to a seeker under RLS, so an invoker-rights version would report blocked and
already-booked times as free. Only timestamps are returned — no block reasons,
no counterparty, no booking identifiers.$$;

revoke execute on function available_slots(uuid, uuid, date, date) from public;
grant  execute on function available_slots(uuid, uuid, date, date) to anon, authenticated;

-- =============================================================================
-- search_events
-- =============================================================================
-- Text + geo + facet search over published events.
--
-- Geo uses the earthdistance pattern the schema already indexes for:
-- earth_box() is a cheap bounding-cube prefilter that the GiST index in 0003
-- can serve, and earth_distance() then trims the corners of that box down to a
-- true radius. Both are needed — the box alone over-selects by up to ~27%.

create or replace function search_events(
  q         text        default null,
  near_lat  float8      default null,
  near_lng  float8      default null,
  radius_km int         default null,
  category  uuid        default null,
  from_date timestamptz default null,
  limit_n   int         default 20,
  offset_n  int         default 0
)
returns table (
  id            uuid,
  host_id       uuid,
  category_id   uuid,
  slug          text,
  title         text,
  summary       text,
  cover_url     text,
  delivery_mode delivery_mode,
  venue_name    text,
  city          text,
  region        text,
  country_code  char(2),
  latitude      float8,
  longitude     float8,
  starts_at     timestamptz,
  ends_at       timestamptz,
  timezone      text,
  is_free       boolean,
  currency      char(3),
  distance_km   float8,
  relevance     real
)
language sql
stable
security invoker
as $$
  with params as (
    select
      -- An all-whitespace q behaves as "no text filter", not "match nothing".
      nullif(btrim(coalesce(search_events.q, '')), '')                  as term,
      case
        when search_events.near_lat is not null
         and search_events.near_lng is not null
        then ll_to_earth(search_events.near_lat, search_events.near_lng)
      end                                                               as origin,
      -- earthdistance works in metres.
      coalesce(search_events.radius_km, 50) * 1000.0                    as radius_m
  ),
  matched as (
    select
      e.id, e.host_id, e.category_id, e.slug, e.title, e.summary, e.cover_url,
      e.delivery_mode, e.venue_name, e.city, e.region, e.country_code,
      -- Hosts who hid the exact address get a null pin. City/region still
      -- describe roughly where it is, and the distance below is still honest.
      case when e.hide_exact_address then null else e.latitude  end as latitude,
      case when e.hide_exact_address then null else e.longitude end as longitude,
      e.starts_at, e.ends_at, e.timezone, e.is_free, e.currency,
      case
        when p.origin is not null and e.latitude is not null and e.longitude is not null
        then round((earth_distance(p.origin, ll_to_earth(e.latitude, e.longitude)) / 1000.0)::numeric, 1)::float8
      end as distance_km,
      case
        when p.term is null then 0::real
        else ts_rank(
               events_search_doc(e.title, e.summary, e.description),
               websearch_to_tsquery('english', p.term)
             )
      end as relevance
    from events e
    cross join params p
    where e.status = 'published'
      and (search_events.category  is null or e.category_id = search_events.category)
      and (search_events.from_date is null or e.starts_at  >= search_events.from_date)
      and (
        p.term is null
        or events_search_doc(e.title, e.summary, e.description)
           @@ websearch_to_tsquery('english', p.term)
      )
      and (
        p.origin is null
        or (
          e.latitude is not null
          and e.longitude is not null
          -- index-servable prefilter ...
          and earth_box(p.origin, p.radius_m) @> ll_to_earth(e.latitude, e.longitude)
          -- ... then the true great-circle distance.
          and earth_distance(p.origin, ll_to_earth(e.latitude, e.longitude)) <= p.radius_m
        )
      )
  )
  select
    m.id, m.host_id, m.category_id, m.slug, m.title, m.summary, m.cover_url,
    m.delivery_mode, m.venue_name, m.city, m.region, m.country_code,
    m.latitude, m.longitude, m.starts_at, m.ends_at, m.timezone,
    m.is_free, m.currency, m.distance_km, m.relevance
  from matched m
  -- Text relevance first when there is a query, then nearest, then soonest.
  -- With no q every row scores 0 and the sort collapses to distance-then-date,
  -- which is the right default for a browse screen.
  order by m.relevance desc, m.distance_km asc nulls last, m.starts_at asc
  limit  greatest(coalesce(search_events.limit_n, 20), 0)
  offset greatest(coalesce(search_events.offset_n, 0), 0);
$$;

comment on function search_events is
$$Search published events by text, proximity, category and start date.

  select * from search_events(
    q         => 'sound bath',
    near_lat  => 51.5072,
    near_lng  => -0.1276,
    radius_km => 25,
    from_date => now(),
    limit_n   => 20
  );

Every argument is optional. q is parsed with websearch_to_tsquery, so quoted
phrases and a leading - to exclude both work. Geo filtering activates only when
near_lat and near_lng are both given; radius_km then defaults to 50. distance_km
is null for events with no coordinates. Events with hide_exact_address return
null latitude/longitude but a real distance_km. security invoker, so the
`published events are public` policy from 0006 still decides visibility —
drafts stay invisible even to a query that would otherwise match them.$$;

grant execute on function search_events(text, float8, float8, int, uuid, timestamptz, int, int)
  to anon, authenticated;

-- =============================================================================
-- search_providers
-- =============================================================================

create or replace function search_providers(
  q          text   default null,
  speciality uuid   default null,
  near_lat   float8 default null,
  near_lng   float8 default null,
  radius_km  int    default null,
  limit_n    int    default 20
)
returns table (
  id             uuid,
  handle         citext,
  display_name   text,
  headline       text,
  avatar_url     text,
  cover_url      text,
  account_type   account_type,
  city           text,
  region         text,
  country_code   char(2),
  latitude       float8,
  longitude      float8,
  is_verified    boolean,
  is_certified   boolean,
  rating_average numeric,
  rating_count   bigint,
  distance_km    float8,
  relevance      real
)
language sql
stable
security invoker
as $$
  with params as (
    select
      nullif(btrim(coalesce(search_providers.q, '')), '')                as term,
      case
        when search_providers.near_lat is not null
         and search_providers.near_lng is not null
        then ll_to_earth(search_providers.near_lat, search_providers.near_lng)
      end                                                                as origin,
      coalesce(search_providers.radius_km, 50) * 1000.0                  as radius_m
  ),
  matched as (
    select
      pr.id, pr.handle, pr.display_name, pr.headline, pr.avatar_url, pr.cover_url,
      pr.account_type, pr.city, pr.region, pr.country_code,
      -- Same privacy rule as events: a profile that hides its exact location
      -- still ranks by distance but never hands out a pin.
      case when pr.hide_exact_location then null else pr.latitude  end as latitude,
      case when pr.hide_exact_location then null else pr.longitude end as longitude,
      pr.is_verified, pr.is_certified,
      rt.average as rating_average,
      coalesce(rt.total, 0) as rating_count,
      case
        when p.origin is not null and pr.latitude is not null and pr.longitude is not null
        then round((earth_distance(p.origin, ll_to_earth(pr.latitude, pr.longitude)) / 1000.0)::numeric, 1)::float8
      end as distance_km,
      case
        when p.term is null then 0::real
        else ts_rank(
               profiles_search_doc(pr.display_name, pr.headline, pr.bio),
               websearch_to_tsquery('english', p.term)
             )
      end as relevance
    from profiles pr
    cross join params p
    -- provider_rating() is stable and reads the same reviews RLS the caller
    -- has, so hidden reviews stay out of the average.
    left join lateral provider_rating(pr.id) rt on true
    where pr.account_type <> 'seeker'      -- seekers do not appear in discovery
      and not pr.is_suspended
      and (
        search_providers.speciality is null
        or exists (
          select 1 from profile_specialities ps
          where ps.profile_id    = pr.id
            and ps.speciality_id = search_providers.speciality
        )
      )
      and (
        p.term is null
        or profiles_search_doc(pr.display_name, pr.headline, pr.bio)
           @@ websearch_to_tsquery('english', p.term)
      )
      and (
        p.origin is null
        or (
          pr.latitude is not null
          and pr.longitude is not null
          and earth_box(p.origin, p.radius_m) @> ll_to_earth(pr.latitude, pr.longitude)
          and earth_distance(p.origin, ll_to_earth(pr.latitude, pr.longitude)) <= p.radius_m
        )
      )
  )
  select
    m.id, m.handle, m.display_name, m.headline, m.avatar_url, m.cover_url,
    m.account_type, m.city, m.region, m.country_code, m.latitude, m.longitude,
    m.is_verified, m.is_certified, m.rating_average, m.rating_count,
    m.distance_km, m.relevance
  from matched m
  -- Verified practitioners break ties ahead of unverified ones at equal
  -- relevance and distance. It is a tiebreak, not a ranking boost.
  order by m.relevance desc,
           m.distance_km asc nulls last,
           m.is_verified desc,
           m.rating_average desc nulls last,
           m.display_name asc
  limit greatest(coalesce(search_providers.limit_n, 20), 0);
$$;

comment on function search_providers is
$$Search practitioner and business profiles by text, speciality and proximity.

  select * from search_providers(
    q          => 'trauma informed massage',
    speciality => '<specialities.id>',
    near_lat   => 51.5072,
    near_lng   => -0.1276,
    radius_km  => 30
  );

Excludes seekers and suspended accounts. Geo filtering activates only when both
near_lat and near_lng are supplied; radius_km defaults to 50. Profiles with
hide_exact_location return null coordinates but a real distance_km. Ratings come
from provider_rating(), so hidden reviews are excluded. security invoker.$$;

grant execute on function search_providers(text, uuid, float8, float8, int, int)
  to anon, authenticated;

-- =============================================================================
-- unread_counts
-- =============================================================================
-- One round trip for the two badges the app shows on every screen.
--
-- Stays security invoker deliberately. Under RLS the messages and notifications
-- policies already scope to auth.uid(), so passing someone else's uuid returns
-- zeroes rather than their inbox size — the permission check is the same code
-- path the rest of the app uses instead of a second hand-written one here.

create or replace function unread_counts(p_profile uuid default auth.uid())
returns table (
  unread_messages      bigint,
  unread_notifications bigint
)
language sql
stable
security invoker
as $$
  select
    (
      select count(*)
      from messages m
      join conversation_participants cp
        on cp.conversation_id = m.conversation_id
       and cp.profile_id      = unread_counts.p_profile
      where m.sender_id  <> unread_counts.p_profile   -- your own messages are not unread
        and m.deleted_at is null
        -- last_read_at null = never opened the thread, so everything counts.
        and (cp.last_read_at is null or m.created_at > cp.last_read_at)
    ),
    (
      select count(*)
      from notifications n
      where n.profile_id = unread_counts.p_profile
        and n.read_at is null
    );
$$;

comment on function unread_counts is
$$Unread message and notification counts for one profile, in a single call.

  select * from unread_counts();                 -- defaults to auth.uid()
  select * from unread_counts('<profile uuid>');

A message is unread when it was sent by someone else, is not soft-deleted, and
postdates the caller's conversation_participants.last_read_at (null = never
opened). security invoker, so RLS returns zeroes for any profile other than the
caller's own rather than leaking a count.$$;

grant execute on function unread_counts(uuid) to authenticated;
