-- =============================================================================
-- MSN — DEVELOPMENT ONLY. DO NOT RUN THIS AGAINST PRODUCTION.
-- =============================================================================
-- Fake practitioners, services, availability and events for local work and
-- screenshots. This file is deliberately NOT a migration: `supabase db push`
-- will never pick it up, because a marketplace cannot tell a seeded provider
-- from a real one once it is in the table.
--
-- Run it explicitly, and only after 0001–0009:
--
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
--        -c "set msn.allow_demo_seed = 'on'" \
--        -f supabase/seed/demo_data.sql
--
-- or, in the SQL editor of a *throwaway* project, prepend:
--
--   set msn.allow_demo_seed = 'on';
--
-- Without that setting the file aborts on the first statement. That guard is
-- the whole reason it exists — a paste into the wrong browser tab is the
-- realistic failure mode, not a mistyped connection string.
--
-- To remove everything again:
--
--   delete from auth.users where email like '%@demo.mysourcenetwork.test';
--
-- All demo emails use the reserved .test TLD (RFC 2606) so none of them can
-- ever resolve or receive mail.
-- =============================================================================

-- The guard sits INSIDE the transaction on purpose. psql does not stop on error
-- by default, so a guard outside it would print a scary message and then seed
-- anyway. Raising inside an open transaction poisons it, and every statement
-- below fails with "current transaction is aborted" instead.
begin;

do $$
begin
  if coalesce(current_setting('msn.allow_demo_seed', true), 'off') <> 'on' then
    raise exception
      'Refusing to seed demo data. Run "set msn.allow_demo_seed = ''on'';" first, and only on a development database.';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Users
-- -----------------------------------------------------------------------------
-- Inserting into auth.users fires handle_new_user() from 0002, which creates
-- the matching profiles row. account_type has to travel in raw_user_meta_data:
-- the guard trigger from 0006 reverts account_type on any UPDATE made by a
-- non-admin, and a psql session has no auth.uid(), so setting it afterwards
-- would silently snap back to 'seeker'.
--
-- encrypted_password is bcrypt of 'demo-password-1234' for every account.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  raw_app_meta_data, raw_user_meta_data
)
values
  ('00000000-0000-0000-0000-000000000000',
   'd0000000-0000-4000-a000-000000000001', 'authenticated', 'authenticated',
   'maya@demo.mysourcenetwork.test',
   '$2a$10$Q7Zt0mJ8Zk3rN1oO2sVv1u9hH6mF0jK5rY8cW2xL4pD7aS1bT3uEe',
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Maya Okonkwo","account_type":"practitioner"}'::jsonb),

  ('00000000-0000-0000-0000-000000000000',
   'd0000000-0000-4000-a000-000000000002', 'authenticated', 'authenticated',
   'tomas@demo.mysourcenetwork.test',
   '$2a$10$Q7Zt0mJ8Zk3rN1oO2sVv1u9hH6mF0jK5rY8cW2xL4pD7aS1bT3uEe',
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Tomás Reyes","account_type":"practitioner"}'::jsonb),

  ('00000000-0000-0000-0000-000000000000',
   'd0000000-0000-4000-a000-000000000003', 'authenticated', 'authenticated',
   'greenhouse@demo.mysourcenetwork.test',
   '$2a$10$Q7Zt0mJ8Zk3rN1oO2sVv1u9hH6mF0jK5rY8cW2xL4pD7aS1bT3uEe',
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"The Greenhouse Studio","account_type":"venue"}'::jsonb),

  ('00000000-0000-0000-0000-000000000000',
   'd0000000-0000-4000-a000-000000000004', 'authenticated', 'authenticated',
   'sam@demo.mysourcenetwork.test',
   '$2a$10$Q7Zt0mJ8Zk3rN1oO2sVv1u9hH6mF0jK5rY8cW2xL4pD7aS1bT3uEe',
   now(), now(), now(), '', '', '', '',
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Sam Whitfield","account_type":"seeker"}'::jsonb)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
-- profiles_guard_trust_flags reverts is_verified/is_certified for any caller
-- that is not an admin, and a direct psql session is not one. Turn the trigger
-- off for the length of this block rather than granting the seed admin rights.
-- Re-enabled immediately below; the whole file is one transaction, so a failure
-- in between rolls the ALTER back too.
alter table profiles disable trigger profiles_guard_trust_flags;

update profiles set
  handle = 'maya', first_name = 'Maya', last_name = 'Okonkwo',
  headline = 'Deep tissue and trauma-informed bodywork',
  bio = 'Fifteen years of clinical massage practice, now working mostly with '
     || 'chronic pain and nervous-system regulation. Slow sessions, no upselling.',
  city = 'London', region = 'Greater London', country_code = 'GB',
  latitude = 51.5416, longitude = -0.1426, timezone = 'Europe/London',
  is_verified = true, is_certified = true, onboarding_done = true,
  profile_completion = 92
where id = 'd0000000-0000-4000-a000-000000000001';

update profiles set
  handle = 'tomas', first_name = 'Tomás', last_name = 'Reyes',
  headline = 'Breathwork facilitator and sound practitioner',
  bio = 'Conscious connected breathwork, gong baths and integration circles. '
     || 'Trained in Peru and Berlin. Online sessions available worldwide.',
  city = 'Lisbon', region = 'Lisboa', country_code = 'PT',
  latitude = 38.7223, longitude = -9.1393, timezone = 'Europe/Lisbon',
  is_verified = true, onboarding_done = true, profile_completion = 78
where id = 'd0000000-0000-4000-a000-000000000002';

update profiles set
  handle = 'greenhouse', headline = 'A small studio for movement and stillness',
  bio = 'Two rooms, a garden and a kettle. We host teachers rather than employ them.',
  city = 'London', region = 'Greater London', country_code = 'GB',
  latitude = 51.5074, longitude = -0.1278, timezone = 'Europe/London',
  hide_exact_location = false, onboarding_done = true, profile_completion = 65
where id = 'd0000000-0000-4000-a000-000000000003';

update profiles set
  handle = 'sam', first_name = 'Sam', last_name = 'Whitfield',
  city = 'London', country_code = 'GB',
  latitude = 51.5155, longitude = -0.0922, timezone = 'Europe/London',
  hide_exact_location = true, onboarding_done = true, profile_completion = 40
where id = 'd0000000-0000-4000-a000-000000000004';

alter table profiles enable trigger profiles_guard_trust_flags;

insert into provider_details (profile_id, years_experience, languages, accepts_bookings)
values
  ('d0000000-0000-4000-a000-000000000001', 15, array['en','ig'], true),
  ('d0000000-0000-4000-a000-000000000002',  8, array['en','es','pt'], true),
  ('d0000000-0000-4000-a000-000000000003',  4, array['en'], false)
on conflict (profile_id) do nothing;

insert into profile_specialities (profile_id, speciality_id)
select p.id, s.id
from (values
  ('d0000000-0000-4000-a000-000000000001'::uuid, 'massage-bodywork'),
  ('d0000000-0000-4000-a000-000000000001'::uuid, 'holistic-health'),
  ('d0000000-0000-4000-a000-000000000002'::uuid, 'breathwork'),
  ('d0000000-0000-4000-a000-000000000002'::uuid, 'sound-healing'),
  ('d0000000-0000-4000-a000-000000000002'::uuid, 'meditation-mindfulness')
) as v(profile_id, speciality_slug)
join profiles p     on p.id  = v.profile_id
join specialities s on s.slug = v.speciality_slug
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Services + availability
-- -----------------------------------------------------------------------------
insert into services (
  id, provider_id, category_id, title, description, delivery_mode,
  duration_minutes, buffer_minutes, price_cents, currency,
  cancellation_window_hours, requires_approval, is_active
)
select v.id, v.provider_id, c.id, v.title, v.description, v.delivery_mode,
       v.duration_minutes, v.buffer_minutes, v.price_cents, v.currency,
       v.cancellation_window_hours, v.requires_approval, true
from (values
  ('5e000000-0000-4000-a000-000000000001'::uuid,
   'd0000000-0000-4000-a000-000000000001'::uuid, 'massage-therapy',
   'Deep tissue massage — 60 min',
   'Focused work on one or two areas. Firm pressure, plenty of check-ins.',
   'in_person'::delivery_mode, 60::smallint, 15::smallint, 8500, 'GBP'::char(3), 24::smallint, false),

  ('5e000000-0000-4000-a000-000000000002'::uuid,
   'd0000000-0000-4000-a000-000000000001'::uuid, 'somatic-therapy',
   'Somatic release session — 90 min',
   'Slower, nervous-system led. Best booked as a series of three.',
   'in_person'::delivery_mode, 90::smallint, 30::smallint, 12000, 'GBP'::char(3), 48::smallint, true),

  ('5e000000-0000-4000-a000-000000000003'::uuid,
   'd0000000-0000-4000-a000-000000000002'::uuid, 'breathwork',
   'One-to-one breathwork (online)',
   'Conscious connected breathing over video, with integration notes afterwards.',
   'one_to_one'::delivery_mode, 75::smallint, 15::smallint, 6500, 'EUR'::char(3), 12::smallint, false)
) as v(id, provider_id, category_slug, title, description, delivery_mode,
       duration_minutes, buffer_minutes, price_cents, currency,
       cancellation_window_hours, requires_approval)
join categories c on c.slug = v.category_slug
on conflict (id) do nothing;

-- Maya: Tue/Wed/Thu 10:00–17:00 London. Tomás: Mon/Wed/Fri 09:00–13:00 Lisbon.
-- Note weekday is 0 = Sunday, matching extract(dow).
-- availability_rules and availability_blocks have no natural unique key, so
-- `on conflict do nothing` would not catch a second run — these use NOT EXISTS
-- against the values themselves instead.
insert into availability_rules (provider_id, weekday, starts_time, ends_time, timezone)
select v.provider_id, v.weekday, v.starts_time, v.ends_time, v.timezone
from (values
  ('d0000000-0000-4000-a000-000000000001'::uuid, 2::smallint, time '10:00', time '17:00', 'Europe/London'),
  ('d0000000-0000-4000-a000-000000000001'::uuid, 3::smallint, time '10:00', time '17:00', 'Europe/London'),
  ('d0000000-0000-4000-a000-000000000001'::uuid, 4::smallint, time '10:00', time '17:00', 'Europe/London'),
  ('d0000000-0000-4000-a000-000000000002'::uuid, 1::smallint, time '09:00', time '13:00', 'Europe/Lisbon'),
  ('d0000000-0000-4000-a000-000000000002'::uuid, 3::smallint, time '09:00', time '13:00', 'Europe/Lisbon'),
  ('d0000000-0000-4000-a000-000000000002'::uuid, 5::smallint, time '09:00', time '13:00', 'Europe/Lisbon')
) as v(provider_id, weekday, starts_time, ends_time, timezone)
where not exists (
  select 1 from availability_rules r
  where r.provider_id = v.provider_id
    and r.weekday     = v.weekday
    and r.starts_time = v.starts_time
);

-- A block a fortnight out, so available_slots() has something to subtract.
insert into availability_blocks (provider_id, starts_at, ends_at, reason)
select 'd0000000-0000-4000-a000-000000000001',
       (current_date + 14) + time '09:00',
       (current_date + 16) + time '18:00',
       'Training weekend'
where not exists (
  select 1 from availability_blocks b
  where b.provider_id = 'd0000000-0000-4000-a000-000000000001'
    and b.reason = 'Training weekend'
);

-- -----------------------------------------------------------------------------
-- Events
-- -----------------------------------------------------------------------------
insert into events (
  id, host_id, category_id, slug, title, summary, description,
  status, published_at, delivery_mode,
  venue_name, address_line1, city, region, country_code, postal_code,
  latitude, longitude, meeting_url,
  starts_at, ends_at, timezone, capacity, is_free, currency
)
select v.id, v.host_id, c.id, v.slug, v.title, v.summary, v.description,
       v.status, case when v.status = 'published' then now() end, v.delivery_mode,
       v.venue_name, v.address_line1, v.city, v.region, v.country_code, v.postal_code,
       v.latitude, v.longitude, v.meeting_url,
       v.starts_at, v.ends_at, v.timezone, v.capacity, v.is_free, v.currency
from (values
  ('e0000000-0000-4000-a000-000000000001'::uuid,
   'd0000000-0000-4000-a000-000000000003'::uuid, 'sound-healing',
   'gong-bath-winter-solstice',
   'Winter Solstice Gong Bath',
   'Ninety minutes of sound, blankets provided.',
   'A full-length gong and singing bowl immersion to mark the longest night. '
     || 'Lie down, stay warm, no experience needed. Tea afterwards in the garden room.',
   'published'::event_status, 'in_person'::delivery_mode,
   'The Greenhouse Studio', '14 Bell Lane', 'London', 'Greater London', 'GB'::char(2), 'E1 7LA',
   51.5074, -0.1278, null::text,
   (current_date + 21) + time '19:00', (current_date + 21) + time '20:30',
   'Europe/London', 24, false, 'GBP'::char(3)),

  ('e0000000-0000-4000-a000-000000000002'::uuid,
   'd0000000-0000-4000-a000-000000000002'::uuid, 'breathwork',
   'breathwork-for-anxiety-online',
   'Breathwork for Anxiety — Online Circle',
   'A gentle introduction, run every fortnight.',
   'A ninety-minute online circle for people who find their breath goes shallow '
     || 'when things get hard. Short teaching, longer practice, optional sharing.',
   'published'::event_status, 'online_live'::delivery_mode,
   null::text, null::text, null::text, null::text, null::char(2), null::text,
   null::float8, null::float8, 'https://meet.example.test/msn-demo-breathwork',
   (current_date + 7) + time '18:00', (current_date + 7) + time '19:30',
   'Europe/Lisbon', 40, false, 'EUR'::char(3)),

  ('e0000000-0000-4000-a000-000000000003'::uuid,
   'd0000000-0000-4000-a000-000000000001'::uuid, 'day-retreats',
   'slow-sunday-day-retreat',
   'Slow Sunday: A Day Retreat',
   'Movement, bodywork, silence and lunch.',
   'Still being written — this one is a draft so the app has an unpublished '
     || 'event to render on the host dashboard.',
   'draft'::event_status, 'in_person'::delivery_mode,
   'The Greenhouse Studio', '14 Bell Lane', 'London', 'Greater London', 'GB'::char(2), 'E1 7LA',
   51.5074, -0.1278, null::text,
   (current_date + 45) + time '10:00', (current_date + 45) + time '17:00',
   'Europe/London', 12, false, 'GBP'::char(3))
) as v(id, host_id, category_slug, slug, title, summary, description,
       status, delivery_mode, venue_name, address_line1, city, region,
       country_code, postal_code, latitude, longitude, meeting_url,
       starts_at, ends_at, timezone, capacity, is_free, currency)
join categories c on c.slug = v.category_slug
on conflict (id) do nothing;

-- Same story as availability_rules: the primary key is generated, so idempotency
-- has to come from (event_id, name) not from ON CONFLICT.
insert into ticket_types (event_id, name, description, price_cents, currency, quantity, max_per_order)
select v.event_id, v.name, v.description, v.price_cents, v.currency, v.quantity, v.max_per_order
from (values
  ('e0000000-0000-4000-a000-000000000001'::uuid, 'General',   'Mat, blanket and bolster included.', 2800, 'GBP'::char(3), 20, 4::smallint),
  ('e0000000-0000-4000-a000-000000000001'::uuid, 'Supported', 'Reduced rate, no questions asked.',  1400, 'GBP'::char(3),  4, 1::smallint),
  ('e0000000-0000-4000-a000-000000000002'::uuid, 'Standard',  'Live attendance plus recording.',    2200, 'EUR'::char(3), 40, 2::smallint)
) as v(event_id, name, description, price_cents, currency, quantity, max_per_order)
where exists (select 1 from events e where e.id = v.event_id)
  and not exists (
    select 1 from ticket_types t
    where t.event_id = v.event_id and t.name = v.name
  );

commit;

-- Sanity check after loading:
--   select * from search_events(q => 'gong');
--   select * from search_providers(q => 'breathwork', near_lat => 38.72, near_lng => -9.14);
--   select * from available_slots(
--            provider  => 'd0000000-0000-4000-a000-000000000001',
--            service   => '5e000000-0000-4000-a000-000000000001',
--            from_date => current_date,
--            to_date   => current_date + 20);
