-- Repair the hand-inserted QA account.
--
-- 0035 inserted straight into `auth.users` and the row would not authenticate:
-- GoTrue answered `Database error querying schema` (a 500, not a credential
-- error). The cause is that several of its token columns are declared NOT NULL
-- in some versions and are read unconditionally in others — a row created by
-- the Auth API gets empty strings, a row created by hand gets NULLs, and the
-- scan blows up on the NULL rather than treating it as "no token".
--
-- The lesson worth keeping: inserting into `auth.users` by hand is fragile
-- across GoTrue versions. Prefer the Auth admin API where a service-role key is
-- available. This exists because one was not.
--
-- Written defensively — every column is set only `where ... is null`, and each
-- is guarded by an existence check, so this applies cleanly whatever the
-- installed GoTrue actually has.

do $$
declare
  col text;
  -- Every text column GoTrue treats as "" rather than NULL.
  token_cols text[] := array[
    'confirmation_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'email_change',
    'phone_change',
    'phone_change_token',
    'reauthentication_token'
  ];
begin
  foreach col in array token_cols loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = col
    ) then
      execute format(
        'update auth.users set %I = '''' where %I is null',
        col, col
      );
    end if;
  end loop;

  raise notice 'Auth token columns normalised.';
end
$$;
