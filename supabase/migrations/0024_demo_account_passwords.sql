-- Make the demo logins actually work.
--
-- `seed/demo_data.sql:55` states "encrypted_password is bcrypt of
-- 'demo-password-1234' for every account". That is not true of this database:
-- the accounts here were created through the Auth admin API during the build,
-- not by running that file, so the documented password has never worked. The
-- fix is to make reality match the documentation that is already in the repo,
-- rather than to introduce a new credential.
--
-- ## Why this is safe to write down
--
-- Every address touched ends in `@demo.mysourcenetwork.test`. `.test` is
-- reserved by RFC 2606 and can never resolve, so none of these can be a real
-- person's mailbox, none can receive mail, and none can be recovered by
-- someone who does not already have access to this database. The password is
-- already published in `seed/demo_data.sql`; this adds no new information.
--
-- ## Guards
--
-- The `where` clause is the whole safety story, so it is deliberately narrow:
--
--   - `email like '%@demo.mysourcenetwork.test'` — the reserved domain only.
--   - Nothing else in `auth.users` is touched. No real address can match.
--
-- If this ever runs against a database whose demo users have been renamed to a
-- live domain it updates nothing, which is the correct failure.
--
-- DO NOT extend this to any other domain, and do not run it anywhere the demo
-- accounts are reachable by the public.

do $$
declare
  touched integer;
begin
  update auth.users
     set encrypted_password = crypt('demo-password-1234', gen_salt('bf')),
         -- Confirm the address too. These accounts can never receive a
         -- confirmation mail, so an unconfirmed one can never be used, and the
         -- project has `mailer_autoconfirm` off.
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where email like '%@demo.mysourcenetwork.test';

  get diagnostics touched = row_count;
  raise notice 'Demo passwords set on % account(s).', touched;

  if touched = 0 then
    raise notice 'No demo accounts matched — nothing was changed.';
  end if;
end
$$;
