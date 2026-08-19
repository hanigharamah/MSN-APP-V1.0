-- Let a seeker start offering sessions.
--
-- ## The door that was locked
--
-- `account_type` is set once, at signup, from `raw_user_meta_data`, and
-- `guard_profile_trust_flags` (0006) reverts any attempt to change it:
--
--     new.account_type := old.account_type;   -- changing type is an admin action
--
-- That was right for the trust flags around it — nobody should be able to make
-- themselves verified — but it caught `account_type` in the same net, and the
-- consequence is that somebody who joined to book a sound bath and later wants
-- to run one has to abandon their account and start again.
--
-- Airbnb never asks. Everyone is a traveller; some people also host, and
-- hosting appears when you have something to offer. This is the same idea:
-- everyone is a seeker, and becoming a practitioner is a decision you make
-- after you have seen the product rather than before.
--
-- ## What this deliberately does NOT open up
--
-- The guard stays exactly as it is. This is a `security definer` function that
-- performs one specific, safe transition and nothing else:
--
--   - Only `seeker` → `practitioner`. Not to `venue`, `business`, `nonprofit`
--     or `organizer` — those describe organisations, and which one you are is
--     a question for a human, not a button.
--   - Never the reverse. Downgrading is not symmetric: a practitioner may hold
--     bookings, listings and a payout relationship, and silently making them a
--     seeker would strand all of it. Someone who wants to stop offering
--     sessions deactivates their services; that already works.
--   - Never touches `is_verified`, `is_certified`, `is_admin` or
--     `is_suspended`. Becoming a practitioner earns you the tools, not the
--     badges — verification stays something MSN grants.

create or replace function become_practitioner()
returns account_type
language plpgsql
security definer
set search_path = public
as $$
declare
  current_type account_type;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '28000';
  end if;

  select account_type into current_type from profiles where id = auth.uid();

  if current_type is null then
    raise exception 'No profile.' using errcode = 'P0002';
  end if;

  -- Already offering something. Returning the current type rather than raising
  -- keeps the call idempotent: a double tap, or a retry after a dropped
  -- response, should not be an error.
  if current_type <> 'seeker' then
    return current_type;
  end if;

  update profiles
     set account_type = 'practitioner'
   where id = auth.uid();

  return 'practitioner'::account_type;
end;
$$;

comment on function become_practitioner is
  'One-way, self-service seeker -> practitioner. Idempotent. Grants the tools, never the trust badges, and never the organisation types.';

revoke execute on function become_practitioner() from anon;
