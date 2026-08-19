-- Actually finish deleting accounts.
--
-- `finalise_account_deletion` has existed since 0025 and nothing has ever
-- called it. Requests went dark and stayed recoverable for ever, which meant
-- the app told people "after 30 days your name, photograph and contact details
-- are erased for good" and then did not erase anything. Apple's requirement is
-- that deletion be *available*, which it was — but the promise in our own copy
-- was not being kept, and that is the part that matters.
--
-- ## The sweep
--
-- `run_account_deletions` finds every profile past its window and finalises
-- each one. Split from `finalise_account_deletion` rather than folded into it,
-- because the two answer different questions: one is "erase this person", which
-- an operator may legitimately want to call for a single account, and one is
-- "erase everyone who is due", which only a schedule should call.
--
-- The window itself stays owned by `finalise_account_deletion`. This selects a
-- candidate set and lets that function re-check each one — so if the two ever
-- disagreed, the stricter check still wins and nobody is erased early.
--
-- ## Scheduling
--
-- pg_cron if the extension is available, which it is on Supabase but not on a
-- bare Postgres. Guarded so this migration still applies where it is not —
-- failing to schedule must not block every later migration. If the notice below
-- appears in your push output, the sweep is NOT running and something else has
-- to call `run_account_deletions()` daily.

create or replace function run_account_deletions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  due record;
  finalised integer := 0;
begin
  for due in
    select id from profiles
    where deletion_requested_at is not null
      and deleted_at is null
  loop
    -- Re-checks the window itself and no-ops if this one is not due yet.
    perform finalise_account_deletion(due.id);
    -- Count what actually changed, not what was considered.
    if exists (select 1 from profiles where id = due.id and deleted_at is not null) then
      finalised := finalised + 1;
    end if;
  end loop;

  return finalised;
end;
$$;

comment on function run_account_deletions is
  'Finalises every account past its 30-day deletion window. Returns how many were erased. Scheduled daily; safe to run by hand.';

revoke execute on function run_account_deletions() from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Schedule it
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    -- Unschedule first so re-running this migration does not stack duplicate
    -- jobs under the same name.
    perform cron.unschedule('msn-account-deletions')
    where exists (select 1 from cron.job where jobname = 'msn-account-deletions');

    -- 03:15 UTC daily. Off the hour deliberately: every job in the world runs
    -- at :00, and this one has no reason to join them.
    perform cron.schedule(
      'msn-account-deletions',
      '15 3 * * *',
      $job$ select run_account_deletions(); $job$
    );

    raise notice 'Account deletion sweep scheduled: daily at 03:15 UTC.';
  else
    raise notice
      'pg_cron is NOT available — the account deletion sweep is not scheduled. Something must call run_account_deletions() daily or erasure never happens.';
  end if;
end
$$;
