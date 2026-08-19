-- Is the deletion sweep actually running?
--
-- 0032 schedules it inside a `do` block that degrades quietly when pg_cron is
-- unavailable. That is the right behaviour — a missing extension must not block
-- every later migration — but it means the push output looks identical whether
-- the job was scheduled or silently skipped. A promise to erase people's data
-- is not something to take on trust from a migration that cannot fail loudly.
--
-- So: a function that answers the question. Admin-only, because it reports
-- infrastructure state rather than anything a member should see.
--
-- `pg_cron` lives outside the public schema and PostgREST will not expose it,
-- so this is also the only way to see the job from the app at all.

create or replace function deletion_sweep_status()
returns table (
  cron_available boolean,
  scheduled      boolean,
  schedule       text,
  pending_count  bigint,
  overdue_count  bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  has_cron boolean;
  job_schedule text;
begin
  if not auth_is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;

  select exists (select 1 from pg_extension where extname = 'pg_cron') into has_cron;

  if has_cron then
    -- Dynamic, because a direct reference to `cron.job` fails to compile at all
    -- where the extension is absent — even inside a branch that never runs.
    begin
      execute 'select schedule from cron.job where jobname = $1'
        into job_schedule using 'msn-account-deletions';
    exception when others then
      job_schedule := null;
    end;
  end if;

  return query
  select
    coalesce(has_cron, false),
    job_schedule is not null,
    job_schedule,
    (select count(*) from profiles
      where deletion_requested_at is not null and deleted_at is null),
    -- Past the window and still here. Anything above zero for more than a day
    -- means the sweep is not running, whatever the schedule says.
    (select count(*) from profiles
      where deletion_requested_at is not null
        and deleted_at is null
        and deletion_requested_at < now() - interval '30 days');
end;
$$;

comment on function deletion_sweep_status is
  'Whether the daily account-deletion sweep is scheduled, and how many accounts are pending or overdue. Admin only. overdue_count above zero means erasure is not happening.';
