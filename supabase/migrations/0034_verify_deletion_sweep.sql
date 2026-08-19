-- Prove the sweep actually erases, then leave no trace.
--
-- 0032 schedules `run_account_deletions` and 0033 reports that it is scheduled,
-- but neither shows it does the thing. A cron entry that fires a function which
-- quietly erases nobody looks exactly like a working one, and this is the
-- promise we make in the app's own copy — worth proving rather than assuming.
--
-- Runs against a throwaway profile, not demo data. A seeded practitioner would
-- have to be destroyed to test this, and anonymisation is irreversible: there
-- is no un-erase, so "test it on Tomás" costs a demo account permanently.
--
-- Every assertion raises. If this migration applied, the sweep works.
--
-- The temporary rows are removed at the end. A real DELETE is possible here
-- precisely because the throwaway has no orders or bookings — which is the same
-- `on delete restrict` that forces anonymisation for everybody who does.

do $$
declare
  probe_id  uuid := gen_random_uuid();
  swept     integer;
  name_after text;
  deleted_after timestamptz;
begin
  -- A profile with no auth user behind it. `profiles.id` references
  -- `auth.users`, so borrow an existing id space by inserting the auth row too.
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', probe_id, 'authenticated',
          'authenticated', 'sweep-probe-' || probe_id::text || '@deleted.invalid',
          '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

  -- `handle_new_user()` creates the profile from the auth row, so update rather
  -- than insert, and backdate past the 30-day window.
  update profiles
     set display_name = 'Sweep Probe',
         deletion_requested_at = now() - interval '31 days'
   where id = probe_id;

  if not found then
    raise exception 'Probe profile was not created — handle_new_user did not fire.';
  end if;

  -- 1 · Someone INSIDE the window must survive. This is the direction that
  --     matters: erasing early is unrecoverable.
  update profiles set deletion_requested_at = now() - interval '3 days' where id = probe_id;
  perform finalise_account_deletion(probe_id);
  select deleted_at into deleted_after from profiles where id = probe_id;
  if deleted_after is not null then
    raise exception 'SAFETY FAILURE: an account only 3 days into a 30-day window was erased.';
  end if;

  -- 2 · Past the window, the sweep erases.
  update profiles set deletion_requested_at = now() - interval '31 days' where id = probe_id;
  select run_account_deletions() into swept;

  select display_name, deleted_at into name_after, deleted_after
  from profiles where id = probe_id;

  if deleted_after is null then
    raise exception 'Sweep did not finalise an account 31 days past its window.';
  end if;
  if name_after <> 'Deleted account' then
    raise exception 'Sweep finalised but did not anonymise: name is still %.', name_after;
  end if;
  if swept < 1 then
    raise exception 'Sweep reported % finalised, expected at least 1.', swept;
  end if;

  raise notice 'Deletion sweep verified: refused at 3 days, erased at 31 days.';

  -- Clean up. Cascades to the profile; possible only because the probe never
  -- bought anything.
  delete from auth.users where id = probe_id;
end
$$;
