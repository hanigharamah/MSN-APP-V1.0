-- One account of every organisation type, all administered by the QA login.
--
-- So the switcher has something real to show, and so each account_type can be
-- seen rendered rather than reasoned about. Demo data — safe to delete.
--
-- Every account is a full profile with its own auth user, because that is what
-- `profiles.id -> auth.users(id)` requires. None of them can be signed into
-- directly (no password is set); they exist to be acted AS, through
-- `account_members`, which is the whole point of the model.

do $$
declare
  qa_id uuid := 'a0000000-0000-4000-a000-0000000000aa'::uuid;
  acct  record;
begin
  for acct in
    select * from (values
      ('b0000000-0000-4000-a000-0000000000b1'::uuid, 'business',
       'The Greenhouse Collective', 'greenhouse-collective',
       'Offering services and events to support wellbeing and personal growth.',
       'https://picsum.photos/seed/msn-acct-business/400'),

      ('b0000000-0000-4000-a000-0000000000b2'::uuid, 'organizer',
       'Still Point Events', 'still-point-events',
       'Hosting and organising events for myself, clients and the community.',
       'https://picsum.photos/seed/msn-acct-organiser/400'),

      ('b0000000-0000-4000-a000-0000000000b3'::uuid, 'venue',
       'The Old Chapel', 'the-old-chapel',
       'Providing a space for hosting events, gatherings and experiences.',
       'https://picsum.photos/seed/msn-acct-venue/400'),

      ('b0000000-0000-4000-a000-0000000000b4'::uuid, 'social_impact',
       'Rooted Futures', 'rooted-futures',
       'A mission-driven entity focused on creating measurable positive change.',
       'https://picsum.photos/seed/msn-acct-impact/400'),

      ('b0000000-0000-4000-a000-0000000000b5'::uuid, 'nonprofit',
       'The Quiet Mind Trust', 'quiet-mind-trust',
       'A registered charity dedicated to public benefit.',
       'https://picsum.photos/seed/msn-acct-nonprofit/400')
    ) as v(id, kind, name, handle, headline, avatar)
  loop
    if exists (select 1 from profiles where id = acct.id) then
      continue;
    end if;

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    values (
      '00000000-0000-0000-0000-000000000000', acct.id, 'authenticated', 'authenticated',
      acct.handle || '@msn.demo',
      -- No usable password. These are acted-as, never signed into.
      extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')),
      now(), now(), now(), '{}'::jsonb,
      jsonb_build_object('display_name', acct.name, 'account_type', acct.kind)
    );

    update profiles
       set display_name = acct.name,
           handle       = acct.handle,
           headline     = acct.headline,
           avatar_url   = acct.avatar,
           account_type = acct.kind::account_type
     where id = acct.id;

    insert into account_members (account_id, member_id, role)
    values (acct.id, qa_id, 'owner');
  end loop;

  raise notice 'Switchable accounts seeded and linked to the QA login.';
end
$$;
