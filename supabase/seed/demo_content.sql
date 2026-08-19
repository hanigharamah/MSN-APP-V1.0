-- =============================================================================
-- MSN — Demo content
-- =============================================================================
-- Development only. Fills the marketplace with enough realistic content to see
-- how the product actually behaves: profiles with photos, published and draft
-- events, paid and free tickets, services with real availability, reviews,
-- bookings in several states, and work waiting in the admin queue.
--
-- Accounts are created separately via the admin API (which sends no email).
-- This file fills in everything hanging off them.
--
-- Images are picsum.photos with fixed seeds — deterministic, no API key, and
-- they always load. Swap for real photography before showing anyone outside
-- the team; generic stock is fine for checking layout, not for a pitch.
-- =============================================================================

do $$
declare
  amara   uuid := '14126a4a-8819-46fc-a24c-0d3a099856f3';
  joaquin uuid := '7466ce42-01f1-4916-909d-72331302a148';
  nour    uuid := '52316ca9-6d03-4ef6-826e-63ba50bc1f48';
  studio  uuid := '631fdb5b-5456-47ac-a7a9-0cf192209f5f';
  barn    uuid := '1178330b-1bbe-4b25-b93a-c1c0f7df889d';
  trust   uuid := 'd1129826-cd1c-417c-98b2-30aff35019ae';
  kaya    uuid := '8dd14134-1dcc-489f-a13b-3e1d785b5621';
  sam     uuid := 'd0000000-0000-4000-a000-000000000004';  -- reuses the original seed's Sam
  priya   uuid := '9823d9d7-33c5-432c-9c89-7267b275737d';
  ev_id   uuid;
  tt_id   uuid;
  svc_id  uuid;
  bk_id   uuid;
  ord_id  uuid;
  oi_id   uuid;
begin

-- ---------------------------------------------------------------- profiles --
update profiles set
  handle = 'amara', headline = 'Somatic therapist & breathwork facilitator',
  bio = 'Fifteen years working with trauma held in the body. I teach people to notice what they are carrying before they try to put it down. Sessions are slow, quiet and unhurried.',
  avatar_url = 'https://picsum.photos/seed/msn-amara/400/400',
  cover_url  = 'https://picsum.photos/seed/msn-amara-cover/1200/600',
  city = 'Lisbon', country_code = 'PT', timezone = 'Europe/Lisbon',
  is_verified = true, is_certified = true, profile_completion = 95
where id = amara;

update profiles set
  handle = 'joaquin', headline = 'Sound healing — gongs, bowls, voice',
  bio = 'I studied with Tibetan practitioners for six years and now hold sound baths for groups of up to thirty. Bring a blanket. Most people fall asleep, which is allowed.',
  avatar_url = 'https://picsum.photos/seed/msn-joaquin/400/400',
  cover_url  = 'https://picsum.photos/seed/msn-joaquin-cover/1200/600',
  city = 'Austin', region = 'Texas', country_code = 'US', timezone = 'America/Chicago',
  is_verified = true, profile_completion = 88
where id = joaquin;

update profiles set
  handle = 'nour', headline = 'Nutritionist. Food as repair, not restriction.',
  bio = 'Registered nutritionist working mostly with people recovering from burnout and disordered eating. No meal plans, no shame, no supplements I would not take myself.',
  avatar_url = 'https://picsum.photos/seed/msn-nour/400/400',
  cover_url  = 'https://picsum.photos/seed/msn-nour-cover/1200/600',
  city = 'London', country_code = 'GB', timezone = 'Europe/London',
  is_certified = true, profile_completion = 72
where id = nour;

update profiles set
  handle = 'stillpoint', headline = 'A small studio for movement and stillness',
  bio = 'Two rooms, wooden floors, good light. We host teachers we trust and keep classes under twelve people.',
  avatar_url = 'https://picsum.photos/seed/msn-studio/400/400',
  cover_url  = 'https://picsum.photos/seed/msn-studio-cover/1200/600',
  city = 'Brighton', country_code = 'GB', timezone = 'Europe/London',
  is_verified = true, profile_completion = 80
where id = studio;

update profiles set
  handle = 'hollowbarn', headline = 'Retreat venue in the Welsh hills',
  bio = 'A restored barn sleeping sixteen, forty minutes from the coast. Wood stove, long table, no wifi in the bedrooms on purpose.',
  avatar_url = 'https://picsum.photos/seed/msn-barn/400/400',
  cover_url  = 'https://picsum.photos/seed/msn-barn-cover/1200/600',
  city = 'Hay-on-Wye', country_code = 'GB', timezone = 'Europe/London',
  profile_completion = 65
where id = barn;

update profiles set
  handle = 'riverkeepers', headline = 'Wild swimming and river restoration',
  bio = 'We clean rivers and teach people to swim in them. Everything we run is pay-what-you-can.',
  avatar_url = 'https://picsum.photos/seed/msn-river/400/400',
  cover_url  = 'https://picsum.photos/seed/msn-river-cover/1200/600',
  city = 'Bristol', country_code = 'GB', timezone = 'Europe/London',
  is_verified = true, profile_completion = 70
where id = trust;

update profiles set
  handle = 'kaya', headline = 'I put on gatherings',
  bio = 'Ceremony, supper clubs, the occasional silent disco in a field.',
  avatar_url = 'https://picsum.photos/seed/msn-kaya/400/400',
  city = 'Manchester', country_code = 'GB', timezone = 'Europe/London',
  profile_completion = 55
where id = kaya;

update profiles set avatar_url = 'https://picsum.photos/seed/msn-sam/400/400'
  where id = sam and avatar_url is null;
update profiles set handle = 'priya', avatar_url = 'https://picsum.photos/seed/msn-priya/400/400',
  city = 'Leeds', country_code = 'GB', timezone = 'Europe/London' where id = priya;

-- ------------------------------------------------------- provider details --
insert into provider_details (profile_id, years_experience, languages, accepts_bookings)
values (amara, 15, '{English,Portuguese}', true),
       (joaquin, 8, '{English,Spanish}', true),
       (nour, 6, '{English,Arabic}', true),
       (studio, 4, '{English}', true),
       (barn, 12, '{English,Welsh}', true),
       (trust, 9, '{English}', true),
       (kaya, 3, '{English}', true)
on conflict (profile_id) do nothing;

-- ------------------------------------------------------------ specialities --
insert into profile_specialities (profile_id, speciality_id)
select amara, id from specialities where slug in ('breathwork','energy-healing','meditation-mindfulness')
union all select joaquin, id from specialities where slug in ('sound-healing','meditation-mindfulness')
union all select nour, id from specialities where slug in ('nutrition','holistic-health')
union all select studio, id from specialities where slug in ('meditation-mindfulness','holistic-health')
on conflict do nothing;

-- ------------------------------------------------------------------ events --
-- Published, paid, in person
insert into events (host_id, title, summary, description, cover_url, status, published_at,
  delivery_mode, venue_name, city, country_code, starts_at, ends_at, timezone, capacity, currency, is_free)
values (joaquin, 'Winter Gong Bath', 'Ninety minutes of sound, lying down, doing nothing.',
  'Bring a mat, a blanket and a pillow. We start with a short settling practice, then an hour of continuous sound across seven gongs and a set of Himalayan bowls. Most people drift in and out of sleep — that is the point, not a failure of concentration.',
  'https://picsum.photos/seed/msn-gong/1200/600', 'published', now(),
  'in_person', 'Stillpoint Studio', 'Brighton', 'GB',
  now() + interval '9 days' + time '19:00', now() + interval '9 days' + time '20:30',
  'Europe/London', 30, 'GBP', false)
returning id into ev_id;
insert into ticket_types (event_id, name, description, price_cents, currency, quantity, max_per_order)
values (ev_id, 'Standard', 'One space, mat provided.', 2200, 'GBP', 24, 4),
       (ev_id, 'Supported', 'Lower price, no questions asked.', 1200, 'GBP', 6, 2);

-- Published, free, nonprofit
insert into events (host_id, title, summary, description, cover_url, status, published_at,
  delivery_mode, venue_name, city, country_code, starts_at, ends_at, timezone, capacity, currency, is_free)
values (trust, 'Dawn Swim & River Clean', 'Cold water, then coffee, then we pick up litter.',
  'Meet at the boathouse for 6.30am. We swim for twenty minutes, warm up properly, and spend an hour clearing the bank. Wetsuits welcome, tow floats provided. No experience needed but you should be comfortable in open water.',
  'https://picsum.photos/seed/msn-river-swim/1200/600', 'published', now(),
  'in_person', 'Netham Boathouse', 'Bristol', 'GB',
  now() + interval '5 days' + time '06:30', now() + interval '5 days' + time '09:00',
  'Europe/London', 20, 'GBP', true)
returning id into ev_id;
insert into ticket_types (event_id, name, description, price_cents, currency, quantity, max_per_order)
values (ev_id, 'Free place', 'Pay nothing. Donations welcome on the day.', 0, 'GBP', 20, 2);

-- Published, retreat, high value
insert into events (host_id, title, summary, description, cover_url, status, published_at,
  delivery_mode, venue_name, city, country_code, starts_at, ends_at, timezone, capacity, currency, is_free)
values (barn, 'Three Nights in the Hills', 'A small silent retreat. Sixteen people, one long table.',
  'Arrive Friday afternoon, leave Monday morning. Silence from Friday evening until Sunday lunch. Two sits a day, one walk, all meals cooked in the barn. No phones in the main room. Amara holds the practice, we hold the kettle.',
  'https://picsum.photos/seed/msn-retreat/1200/600', 'published', now(),
  'in_person', 'The Hollow Barn', 'Hay-on-Wye', 'GB',
  now() + interval '38 days' + time '16:00', now() + interval '41 days' + time '11:00',
  'Europe/London', 16, 'GBP', false)
returning id into ev_id;
insert into ticket_types (event_id, name, description, price_cents, currency, quantity, max_per_order)
values (ev_id, 'Shared room', 'Two beds, shared bathroom.', 42000, 'GBP', 10, 2),
       (ev_id, 'Single room', 'Your own room.', 58000, 'GBP', 4, 1),
       (ev_id, 'Bursary place', 'Two per retreat. Ask us.', 15000, 'GBP', 2, 1);

-- Published, online (this one is IAP-only on iOS — useful for testing that rule)
insert into events (host_id, title, summary, description, cover_url, status, published_at,
  delivery_mode, meeting_url, starts_at, ends_at, timezone, currency, is_free)
values (amara, 'Breathwork for Anxiety — Online Circle', 'A live session you can join from your floor.',
  'Forty-five minutes of guided breathing, then fifteen for questions. Camera optional. If you have a history of panic, message me first and we will adjust the pace.',
  'https://picsum.photos/seed/msn-breath/1200/600', 'published', now(),
  'online_live', 'https://meet.msn.demo/breath-circle',
  now() + interval '3 days' + time '19:00', now() + interval '3 days' + time '20:00',
  'Europe/Lisbon', 'EUR', false)
returning id into ev_id;
insert into ticket_types (event_id, name, price_cents, currency, quantity, max_per_order)
values (ev_id, 'Live place', 2200, 'EUR', 40, 2);

-- A draft, so the host tools have something unpublished to show
insert into events (host_id, title, summary, cover_url, status, delivery_mode,
  venue_name, city, country_code, starts_at, ends_at, timezone, currency, is_free)
values (kaya, 'Supper Club — Autumn', 'Long table, six courses, strangers.',
  'https://picsum.photos/seed/msn-supper/1200/600', 'draft', 'in_person',
  'TBC', 'Manchester', 'GB',
  now() + interval '60 days' + time '19:00', now() + interval '60 days' + time '23:00',
  'Europe/London', 'GBP', false);

-- ---------------------------------------------------------------- services --
insert into services (provider_id, title, description, cover_url, delivery_mode,
  duration_minutes, buffer_minutes, price_cents, currency, cancellation_window_hours, requires_approval)
values
 (amara, 'Somatic session', 'One to one, in person or online. We work with what is present rather than a fixed protocol.',
  'https://picsum.photos/seed/msn-somatic/800/500', 'one_to_one', 75, 15, 8500, 'EUR', 24, false),
 (amara, 'First conversation', 'Twenty minutes, free, to work out whether I am the right person.',
  'https://picsum.photos/seed/msn-chat/800/500', 'one_to_one', 20, 10, 0, 'EUR', 2, false),
 (nour, 'Nutrition consultation', 'Ninety minutes. Bring a week of what you actually ate, not what you meant to.',
  'https://picsum.photos/seed/msn-nutrition/800/500', 'one_to_one', 90, 15, 9500, 'GBP', 48, true),
 (nour, 'Follow-up', 'Forty-five minutes, for people I have seen before.',
  'https://picsum.photos/seed/msn-followup/800/500', 'one_to_one', 45, 15, 5500, 'GBP', 24, false),
 (joaquin, 'Private sound session', 'One person, one hour, full set of bowls.',
  'https://picsum.photos/seed/msn-private-sound/800/500', 'one_to_one', 60, 30, 9000, 'USD', 24, false),
 (studio, 'Studio hire — half day', 'Either room, four hours, mats and blocks included.',
  'https://picsum.photos/seed/msn-hire/800/500', 'in_person', 240, 60, 12000, 'GBP', 72, true);

-- ------------------------------------------------------------ availability --
insert into availability_rules (provider_id, weekday, starts_time, ends_time, timezone)
select amara, d, '09:00'::time, '17:00'::time, 'Europe/Lisbon' from unnest(array[1,2,3,4]) d
union all select nour, d, '10:00'::time, '18:00'::time, 'Europe/London' from unnest(array[1,2,4,5]) d
union all select joaquin, d, '11:00'::time, '19:00'::time, 'America/Chicago' from unnest(array[2,3,5,6]) d
union all select studio, d, '08:00'::time, '20:00'::time, 'Europe/London' from unnest(array[1,2,3,4,5,6]) d;

insert into availability_blocks (provider_id, starts_at, ends_at, reason)
values (amara, now() + interval '14 days', now() + interval '21 days', 'Teaching abroad'),
       (nour, now() + interval '6 days', now() + interval '7 days', 'Conference');

-- ----------------------------------------------------------------- reviews --
-- Anchored to bookings so `review_needs_transaction` is satisfied.
insert into bookings (seeker_id, provider_id, service_id, status, starts_at, ends_at,
  cancellation_window_hours, rail, total_cents, currency, confirmed_at)
select sam, amara, s.id, 'completed', now() - interval '20 days', now() - interval '20 days' + interval '75 minutes',
  24, 'stripe', 8500, 'EUR', now() - interval '25 days'
from services s where s.provider_id = amara and s.title = 'Somatic session'
returning id into bk_id;
insert into reviews (author_id, subject_id, booking_id, rating, body)
values (sam, amara, bk_id, 5, 'I have tried to talk my way out of this stuff for years. Amara did not let me, kindly.');

insert into bookings (seeker_id, provider_id, service_id, status, starts_at, ends_at,
  cancellation_window_hours, rail, total_cents, currency, confirmed_at)
select priya, nour, s.id, 'completed', now() - interval '12 days', now() - interval '12 days' + interval '90 minutes',
  48, 'stripe', 9500, 'GBP', now() - interval '18 days'
from services s where s.provider_id = nour and s.title = 'Nutrition consultation'
returning id into bk_id;
insert into reviews (author_id, subject_id, booking_id, rating, body)
values (priya, nour, bk_id, 5, 'No meal plan, no lecture. First time I have left one of these not feeling told off.');

-- Upcoming bookings, so the Bookings tab has content in several states
insert into bookings (seeker_id, provider_id, service_id, status, starts_at, ends_at,
  cancellation_window_hours, rail, total_cents, currency, confirmed_at)
select sam, nour, s.id, 'confirmed', now() + interval '4 days' + time '11:00',
  now() + interval '4 days' + time '12:30', 48, 'stripe', 9500, 'GBP', now() - interval '2 days'
from services s where s.provider_id = nour and s.title = 'Nutrition consultation';

insert into bookings (seeker_id, provider_id, service_id, status, starts_at, ends_at,
  cancellation_window_hours, rail, total_cents, currency, seeker_note)
select priya, amara, s.id, 'requested', now() + interval '8 days' + time '14:00',
  now() + interval '8 days' + time '15:15', 24, 'stripe', 8500, 'EUR',
  'I have done breathwork once and found it overwhelming. Can we go slowly?'
from services s where s.provider_id = amara and s.title = 'Somatic session';

end $$;
