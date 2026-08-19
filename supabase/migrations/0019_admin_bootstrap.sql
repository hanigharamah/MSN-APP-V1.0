-- =============================================================================
-- MSN — 0019 · Let the service role grant admin
-- =============================================================================
-- `guard_profile_trust_flags` (0006) pins is_verified / is_certified / is_admin
-- / is_suspended / account_type for anyone who is not already an admin. That is
-- correct for users, but it also applies to the service role and to direct SQL,
-- where `auth.uid()` is null — so `auth_is_admin()` is false and the flags are
-- reverted.
--
-- The consequence: with no admin in the system, no admin can ever be created.
-- Nobody can verify a practitioner, decide a refund, or resolve a report.
--
-- The booking guard added in 0017 already gets this right (`if auth.uid() is
-- null or auth_is_admin()`). This brings 0006 into line.
--
-- No user gains anything: a signed-in caller always has a non-null auth.uid(),
-- so the guard still applies to every request that comes through the API.
-- =============================================================================

create or replace function guard_profile_trust_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for the service role, Edge Functions and direct SQL.
  -- Those are trusted callers; every user request has a uid.
  if auth.uid() is null or auth_is_admin() then
    return new;
  end if;

  new.is_verified   := old.is_verified;
  new.is_certified  := old.is_certified;
  new.is_admin      := old.is_admin;
  new.is_suspended  := old.is_suspended;
  new.account_type  := old.account_type;
  return new;
end;
$$;

comment on function guard_profile_trust_flags is
  'Silently reverts privileged profile columns for ordinary users. Service role and admins bypass — without that exemption the first admin could never be created.';
