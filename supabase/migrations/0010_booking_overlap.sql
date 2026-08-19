-- =============================================================================
-- MSN — 0010 · Prevent double-booking at the database level
-- =============================================================================
-- Both `available_slots` (SQL) and the `book-service` Edge Function check for
-- conflicts before inserting, but a check-then-insert is not atomic. Two
-- requests for the same slot arriving together will both pass their check and
-- both commit.
--
-- These exclusion constraints make overlap impossible regardless of how many
-- writers race. The application checks stay — they produce good error messages;
-- these produce correctness.
--
-- Status set matches LIVE_BOOKING_STATUSES in
-- supabase/functions/book-service/index.ts. If one changes, change both.
-- =============================================================================

-- Needed to mix equality (uuid) with range overlap (&&) in one GiST index.
create extension if not exists btree_gist;

-- A provider cannot be in two places at once.
alter table bookings
  add constraint bookings_no_provider_overlap
  exclude using gist (
    provider_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('requested', 'confirmed', 'completed'));

-- Neither can a seeker. book-service already rejects this (its second clash
-- query); this is the atomic backstop for it.
alter table bookings
  add constraint bookings_no_seeker_overlap
  exclude using gist (
    seeker_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('requested', 'confirmed', 'completed'));

comment on constraint bookings_no_provider_overlap on bookings is
  'Atomic guarantee that a provider is never double-booked. Ranges are half-open [) so a booking ending at 10:00 and one starting at 10:00 do not conflict. Violations surface as SQLSTATE 23P01 — the API layer should translate that to a 409 telling the caller the slot was just taken.';

comment on constraint bookings_no_seeker_overlap on bookings is
  'Same guarantee for the seeker. Note: a seeker booking on behalf of someone else at an overlapping time will be rejected. If that becomes a real use case, this constraint is the thing to relax, not the provider one.';

-- -----------------------------------------------------------------------------
-- Note on buffers
-- -----------------------------------------------------------------------------
-- services.buffer_minutes is NOT enforced here. These constraints prevent
-- literal overlap of stored ranges; the buffer is a scheduling preference
-- applied when generating and validating slots. Enforcing it at the database
-- would mean widening the stored range, which would then misreport the actual
-- appointment time everywhere else. Buffer stays in available_slots and
-- book-service.
