-- A test account with a short address.
--
-- Signing in on the iOS simulator is done by injecting keystrokes, and that
-- input drops characters on longer strings — it ate `@msn` out of
-- `demo@msn.test` twice in a row, which burned several attempts at verifying
-- the payment sheet and produced no information about the thing being tested.
--
-- `q@m.test` is eight characters. Same reserved `.test` TLD as every other demo
-- account (RFC 2606, can never resolve or receive mail), same published
-- password. It exists so device verification is about the feature rather than
-- about whether the keyboard cooperated.
--
-- Practitioner, not seeker: the same account then covers the seeker paths
-- (buying, booking, photo upload) AND the host paths (door check-in), because
-- a practitioner can do everything a seeker can. One login for all of it.

do $$
declare
  qa_id uuid := -- Hex only: 'qa' is not a valid uuid.
    'a0000000-0000-4000-a000-0000000000aa'::uuid;
begin
  -- Idempotent: re-running must not fail on the unique email.
  if exists (select 1 from auth.users where email = 'q@m.test') then
    raise notice 'QA account already exists.';
    return;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values (
    '00000000-0000-0000-0000-000000000000', qa_id, 'authenticated', 'authenticated',
    'q@m.test', crypt('demo-password-1234', gen_salt('bf')),
    now(), now(), now(), '{}'::jsonb,
    -- `handle_new_user` reads these, and `account_type` is settable exactly
    -- once, here, at signup.
    jsonb_build_object('display_name', 'QA Tester', 'account_type', 'practitioner')
  );

  update profiles
     set display_name = 'QA Tester',
         handle       = 'qa',
         headline     = 'Test account',
         account_type = 'practitioner',
         avatar_url   = 'https://i.pravatar.cc/600?img=15'
   where id = qa_id;

  raise notice 'QA account created: q@m.test';
end
$$;
