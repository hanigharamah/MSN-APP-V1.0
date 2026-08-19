-- =============================================================================
-- MSN — 0017 · Constrain who may make which booking status transition
-- =============================================================================
-- `0006`'s "parties update bookings" policy grants UPDATE to both the seeker
-- and the provider with no column or transition constraints. So today a seeker
-- can set their own booking to `confirmed`, `completed` or `no_show`, and a
-- provider can set `cancelled_by_seeker`. The UI gating is the only control,
-- and a UI control is not a control.
--
-- RLS policies cannot compare OLD and NEW, so this is a trigger — the same
-- shape as `guard_profile_trust_flags` in 0006.
--
-- Also closes a second hole the QA pass found: the client mutations filter on
-- `.eq('id', …)` alone, so a stale screen could resurrect a `declined` booking
-- into `confirmed`. Illegal transitions now raise rather than silently apply.
-- =============================================================================

create or replace function guard_booking_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_seeker   boolean := old.seeker_id   = auth.uid();
  is_provider boolean := old.provider_id = auth.uid();
begin
  -- Service role and admins bypass: Edge Functions and the admin console do
  -- legitimate transitions the parties themselves may not.
  if auth.uid() is null or auth_is_admin() then
    return new;
  end if;

  -- Money, parties and terms are never client-writable. Silently pinned rather
  -- than raised, matching how the profile trust flags behave.
  new.seeker_id   := old.seeker_id;
  new.provider_id := old.provider_id;
  new.service_id  := old.service_id;
  new.total_cents := old.total_cents;
  new.platform_fee_cents := old.platform_fee_cents;
  new.currency    := old.currency;
  new.rail        := old.rail;
  new.stripe_payment_intent_id := old.stripe_payment_intent_id;
  new.store_transaction_id     := old.store_transaction_id;
  new.cancellation_window_hours := old.cancellation_window_hours;
  new.reference   := old.reference;
  new.starts_at   := old.starts_at;
  new.ends_at     := old.ends_at;

  if new.status is distinct from old.status then
    -- A terminal booking is done. Nothing reopens it.
    if old.status in ('declined', 'cancelled_by_seeker', 'cancelled_by_provider',
                      'completed', 'no_show') then
      raise exception 'Booking % is already closed (%). It cannot be changed.',
        old.reference, old.status
        using errcode = 'check_violation';
    end if;

    if is_provider then
      -- The provider accepts, refuses, calls it done, or records a no-show.
      if new.status not in ('confirmed', 'declined', 'cancelled_by_provider',
                            'completed', 'no_show') then
        raise exception 'A practitioner cannot move a booking to %.', new.status
          using errcode = 'check_violation';
      end if;
      if new.status = 'confirmed' and old.status <> 'requested' then
        raise exception 'Only a requested booking can be confirmed.'
          using errcode = 'check_violation';
      end if;
    elsif is_seeker then
      -- The seeker may only withdraw. Not confirm their own booking, not mark
      -- it completed, and certainly not record a no-show against themselves.
      if new.status <> 'cancelled_by_seeker' then
        raise exception 'You can only cancel your own booking, not move it to %.',
          new.status using errcode = 'check_violation';
      end if;
    else
      raise exception 'Only the seeker or the practitioner can change this booking.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

create trigger bookings_guard_transition
  before update on bookings
  for each row execute function guard_booking_transition();

comment on function guard_booking_transition is
  'Enforces who may make which booking status transition, and pins money/party/term columns. RLS cannot see OLD, so this has to be a trigger. Service role and admins bypass.';
