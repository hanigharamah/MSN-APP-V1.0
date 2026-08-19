-- =============================================================================
-- MSN — 0001 · Extensions, enums, and shared helpers
-- =============================================================================
-- Design notes:
--   * Every status concept gets ONE enum. The Laravel app carries three
--     overlapping columns for event state (status / event_status / is_draft)
--     which is the root cause of its "status is inconsistent" defects. Not
--     repeating that here.
--   * Trust flags (verified) are never writable by the owning user. Enforced
--     by RLS in 0006, not by application convention.
-- =============================================================================

create extension if not exists "pgcrypto";       -- gen_random_uuid()
create extension if not exists "citext";         -- case-insensitive email/handles
create extension if not exists "cube";           -- required by earthdistance
create extension if not exists "earthdistance";  -- geo proximity search

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- Who someone is on the network.
create type account_type as enum (
  'seeker',
  'practitioner',
  'business',
  'venue',
  'nonprofit',
  'organizer'
);

-- The single source of truth for whether an event is live.
create type event_status as enum (
  'draft',        -- being written, never been public
  'published',    -- live and bookable
  'cancelled',    -- called off by the host
  'completed',    -- has happened
  'archived'      -- hidden by host, not deleted
);

-- Where an offering happens. Drives payment routing (Apple IAP rules).
create type delivery_mode as enum (
  'in_person',    -- consumed outside the app -> external payment REQUIRED
  'online_live',  -- one-to-many realtime     -> IAP REQUIRED on iOS
  'one_to_one'    -- realtime between two people -> external payment permitted
);

create type order_status as enum (
  'pending',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
  'cancelled'
);

create type booking_status as enum (
  'requested',
  'confirmed',
  'declined',
  'cancelled_by_seeker',
  'cancelled_by_provider',
  'completed',
  'no_show'
);

create type refund_status as enum (
  'requested',
  'approved',
  'declined',
  'processed'
);

-- Which rail the money moved on. Recorded per order so refunds know who can
-- issue them: Apple/Google purchases can only be refunded by Apple/Google.
create type payment_rail as enum (
  'stripe',
  'apple_iap',
  'google_play',
  'tokens'
);

create type conversation_kind as enum (
  'direct',
  'booking',
  'event'
);

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------

-- Keeps updated_at honest without relying on the client.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- NOTE: auth_account_type() and auth_is_admin() are defined at the end of
-- 0002_identity.sql, not here. They query public.profiles, and Postgres
-- validates SQL-language function bodies at CREATE time — so they cannot be
-- declared before the table exists.
