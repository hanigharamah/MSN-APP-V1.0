-- =============================================================================
-- MSN — 0003 · Catalog: what providers offer
-- =============================================================================
-- Two offering shapes, deliberately separate because they behave differently:
--   events    — one-to-many, ticketed, fixed date
--   services  — one-to-one, booked against availability
-- The Laravel app models these separately too. That split is correct and is
-- preserved here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Taxonomy
-- -----------------------------------------------------------------------------
create table categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  parent_id   uuid references categories(id) on delete set null,
  icon_url    text,
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table specialities (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  is_active   boolean not null default true
);

create table profile_specialities (
  profile_id      uuid references profiles(id) on delete cascade,
  speciality_id   uuid references specialities(id) on delete cascade,
  primary key (profile_id, speciality_id)
);

-- Seed the specialities the platform already uses.
insert into specialities (slug, name) values
  ('astrology','Astrology'),
  ('breathwork','Breathwork'),
  ('coaching','Coaching'),
  ('energy-healing','Energy Healing'),
  ('holistic-health','Holistic Health'),
  ('massage-bodywork','Massage & Bodywork'),
  ('meditation-mindfulness','Meditation & Mindfulness'),
  ('nutrition','Nutrition'),
  ('shamanic-practices','Shamanic Practices'),
  ('sound-healing','Sound Healing')
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Events — one-to-many, ticketed
-- -----------------------------------------------------------------------------
create table events (
  id                uuid primary key default gen_random_uuid(),
  host_id           uuid not null references profiles(id) on delete cascade,
  category_id       uuid references categories(id) on delete set null,

  slug              text unique,
  title             text not null,
  summary           text,
  description       text,
  cover_url         text,
  video_url         text,

  -- ONE status column. Not three.
  status            event_status not null default 'draft',
  published_at      timestamptz,

  delivery_mode     delivery_mode not null default 'in_person',

  -- Where
  venue_name        text,
  address_line1     text,
  address_line2     text,
  city              text,
  region            text,
  country_code      char(2),
  postal_code       text,
  latitude          double precision,
  longitude         double precision,
  hide_exact_address boolean not null default false,
  meeting_url       text,               -- online events only
  hide_meeting_url  boolean not null default true,

  -- When (single occurrence lives here; repeats live in event_occurrences)
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  timezone          text not null default 'UTC',
  is_recurring      boolean not null default false,

  capacity          integer check (capacity is null or capacity > 0),
  min_age           smallint,

  is_free           boolean not null default false,
  currency          char(3) not null default 'USD',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint events_end_after_start check (ends_at > starts_at),
  constraint events_published_has_timestamp
    check (status <> 'published' or published_at is not null),
  constraint events_online_needs_link
    check (delivery_mode = 'in_person' or meeting_url is not null or status = 'draft')
);

create index events_status_starts_idx on events (status, starts_at);
create index events_host_idx on events (host_id);
create index events_category_idx on events (category_id);
create index events_geo_idx on events
  using gist (ll_to_earth(latitude, longitude))
  where latitude is not null and longitude is not null;

create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();

comment on constraint events_online_needs_link on events is
  'A published online event without a join link is the failure mode behind MSN-DEV-2245. Caught at the database instead of silently.';

-- Repeats
create table event_occurrences (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  capacity    integer,
  is_cancelled boolean not null default false,
  constraint occurrence_end_after_start check (ends_at > starts_at)
);

create index event_occurrences_event_idx on event_occurrences (event_id, starts_at);

create table event_images (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  url         text not null,
  sort_order  smallint not null default 0
);

-- -----------------------------------------------------------------------------
-- Ticket types
-- -----------------------------------------------------------------------------
create table ticket_types (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references events(id) on delete cascade,

  name            text not null,
  description     text,
  price_cents     integer not null default 0 check (price_cents >= 0),
  currency        char(3) not null default 'USD',
  token_cost      smallint check (token_cost is null or token_cost > 0),

  quantity        integer check (quantity is null or quantity >= 0),
  quantity_sold   integer not null default 0 check (quantity_sold >= 0),
  max_per_order   smallint not null default 10,

  sales_start_at  timestamptz,
  sales_end_at    timestamptz,

  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Guards the malformed-date defect in MSN-DEV-2247.
  constraint ticket_sales_window_valid
    check (sales_start_at is null or sales_end_at is null or sales_end_at > sales_start_at),
  constraint ticket_not_oversold
    check (quantity is null or quantity_sold <= quantity)
);

create index ticket_types_event_idx on ticket_types (event_id);

create trigger ticket_types_set_updated_at
  before update on ticket_types
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Services — one-to-one, booked against availability
-- -----------------------------------------------------------------------------
create table services (
  id                uuid primary key default gen_random_uuid(),
  provider_id       uuid not null references profiles(id) on delete cascade,
  category_id       uuid references categories(id) on delete set null,

  title             text not null,
  description       text,
  cover_url         text,

  delivery_mode     delivery_mode not null default 'one_to_one',
  duration_minutes  smallint not null check (duration_minutes > 0),
  buffer_minutes    smallint not null default 0 check (buffer_minutes >= 0),

  price_cents       integer not null default 0 check (price_cents >= 0),
  currency          char(3) not null default 'USD',
  token_cost        smallint check (token_cost is null or token_cost > 0),

  -- How long before the start a seeker may cancel and still be refunded.
  -- Shown on the booking screen before payment; see refund policy §2.1.
  cancellation_window_hours smallint not null default 24,

  requires_approval boolean not null default false,
  is_active         boolean not null default true,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index services_provider_idx on services (provider_id) where is_active;

create trigger services_set_updated_at
  before update on services
  for each row execute function set_updated_at();

-- Weekly recurring availability
create table availability_rules (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references profiles(id) on delete cascade,
  weekday       smallint not null check (weekday between 0 and 6),  -- 0 = Sunday
  starts_time   time not null,
  ends_time     time not null,
  timezone      text not null default 'UTC',
  constraint availability_end_after_start check (ends_time > starts_time)
);

create index availability_provider_idx on availability_rules (provider_id, weekday);

-- One-off blocks (holiday, already booked elsewhere)
create table availability_blocks (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references profiles(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  reason        text,
  constraint block_end_after_start check (ends_at > starts_at)
);

create index availability_blocks_provider_idx on availability_blocks (provider_id, starts_at);
