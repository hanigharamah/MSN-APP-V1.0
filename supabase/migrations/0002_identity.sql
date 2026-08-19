-- =============================================================================
-- MSN — 0002 · Identity
-- =============================================================================
-- profiles extends auth.users 1:1. Supabase Auth owns credentials; this owns
-- everything about who the person is on the network.
-- =============================================================================

create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,

  account_type      account_type not null default 'seeker',
  handle            citext unique,
  display_name      text not null,
  first_name        text,
  last_name         text,
  headline          text,                 -- one-line "what I do"
  bio               text,
  avatar_url        text,
  cover_url         text,

  email             citext,
  phone             text,
  website           text,

  -- Location. lat/lng kept loose so proximity search works without PostGIS.
  country_code      char(2),
  region            text,
  city              text,
  postal_code       text,
  latitude          double precision,
  longitude         double precision,
  hide_exact_location boolean not null default false,
  timezone          text not null default 'UTC',

  -- Trust flags. NEVER writable by the owning user — see RLS in 0006.
  is_verified       boolean not null default false,
  is_certified      boolean not null default false,
  is_admin          boolean not null default false,

  -- Lifecycle
  is_suspended      boolean not null default false,
  onboarding_done   boolean not null default false,
  profile_completion smallint not null default 0
                     check (profile_completion between 0 and 100),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index profiles_account_type_idx on profiles (account_type);
create index profiles_geo_idx on profiles
  using gist (ll_to_earth(latitude, longitude))
  where latitude is not null and longitude is not null;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

comment on column profiles.is_verified is
  'Platform-granted trust badge. Writable only by admins (RLS). Never expose in an updatable column list.';

-- -----------------------------------------------------------------------------
-- Auto-create a profile when someone signs up
-- -----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, account_type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'account_type')::account_type, 'seeker')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- -----------------------------------------------------------------------------
-- Provider detail — only for accounts that offer something
-- -----------------------------------------------------------------------------
create table provider_details (
  profile_id        uuid primary key references profiles(id) on delete cascade,

  legal_name        text,
  tax_id            text,
  years_experience  smallint,
  languages         text[] not null default '{}',

  -- Payout wiring. Stripe Connect account id, once onboarded.
  stripe_account_id text,
  payouts_enabled   boolean not null default false,

  accepts_bookings  boolean not null default true,
  is_out_of_office  boolean not null default false,
  out_of_office_until date,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger provider_details_set_updated_at
  before update on provider_details
  for each row execute function set_updated_at();

comment on column provider_details.stripe_account_id is
  'Stripe Connect account. Never store a provider secret key here — the Laravel app does that and it should not be copied.';

-- -----------------------------------------------------------------------------
-- Push notification devices
-- -----------------------------------------------------------------------------
create table push_tokens (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id) on delete cascade,
  token         text not null,
  platform      text not null check (platform in ('ios','android','web')),
  device_name   text,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (profile_id, token)
);

create index push_tokens_profile_idx on push_tokens (profile_id);

-- -----------------------------------------------------------------------------
-- Auth helpers — defined here rather than 0001 because they query profiles,
-- and Postgres validates SQL-language function bodies at CREATE time.
-- security definer so RLS policies can call them without recursing back into
-- the profiles policies that call them.
-- -----------------------------------------------------------------------------
create or replace function auth_account_type()
returns account_type
language sql
stable
security definer
set search_path = public
as $$
  select account_type from public.profiles where id = auth.uid();
$$;

create or replace function auth_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

comment on function auth_account_type is
  'account_type of the current user. security definer so RLS policies can call it without recursing into profiles RLS.';
