-- A session starting in five minutes, so the welcome card can be seen.
--
-- "Your seekers" only appears from 15 minutes before a session until it ends,
-- which is correct behaviour and makes it impossible to verify against the
-- seeded events — they are all days away. This creates one event owned by the
-- QA account that is inside the window at the moment it is applied, with real
-- attendees who have photographs.
--
-- Demo data. Named so it is obvious in any list, and safe to delete.
--
-- The ticket chain is order -> order_item -> ticket, all of it NOT NULL, so
-- attendees cannot be conjured directly onto an event. Built here the same way
-- `create-checkout` builds it, which is also a small proof that the shape is
-- right.

do $$
declare
  qa_id      uuid := 'a0000000-0000-4000-a000-0000000000aa'::uuid;
  event_id   uuid := 'e0000000-0000-4000-a000-0000000000e1'::uuid;
  tt_id      uuid := 'e0000000-0000-4000-a000-0000000000f1'::uuid;
  cat_id     uuid;
  order_id   uuid;
  item_id    uuid;
  seeker     record;
begin
  if exists (select 1 from events where id = event_id) then
    -- Re-running only slides the clock forward, so the window reopens.
    update events
       set starts_at = now() + interval '5 minutes',
           ends_at   = now() + interval '3 hours'
     where id = event_id;
    raise notice 'QA welcome event refreshed.';
    return;
  end if;

  select id into cat_id from categories order by sort_order limit 1;

  insert into events (
    id, host_id, category_id, slug, title, summary, description,
    status, published_at, delivery_mode,
    venue_name, address_line1, city, country_code,
    starts_at, ends_at, timezone, is_free, currency, cover_url
  ) values (
    event_id, qa_id, cat_id, 'qa-welcome-test',
    'QA — Welcome card test', 'A test session for verifying the welcome card.',
    'Demo data. Delete freely.',
    'published', now(), 'in_person',
    'The Greenhouse Studio', '14 Bell Lane', 'London', 'GB',
    now() + interval '5 minutes', now() + interval '3 hours',
    'Europe/London', false, 'GBP',
    'https://picsum.photos/seed/msn-qa-welcome/1200/600'
  );

  insert into ticket_types (id, event_id, name, description, price_cents, currency, quantity)
  values (tt_id, event_id, 'Standard', 'Test tier.', 1000, 'GBP', 50);

  -- One paid order per seeker, so each ticket has a real holder with a face.
  for seeker in
    select id, display_name from profiles
    where avatar_url is not null and id <> qa_id
    order by display_name
    limit 6
  loop
    -- `purchased_at` is required by `orders_paid_has_timestamp` — a paid order
    -- must say when. Working as intended; noted here so the next person
    -- writing seed data does not rediscover it.
    insert into orders (buyer_id, event_id, status, rail, currency,
                        subtotal_cents, total_cents, platform_fee_cents, purchased_at)
    values (seeker.id, event_id, 'paid', 'stripe', 'GBP', 1000, 1100, 100, now())
    returning id into order_id;

    insert into order_items (order_id, ticket_type_id, quantity, unit_price_cents)
    values (order_id, tt_id, 1, 1000)
    returning id into item_id;

    insert into tickets (order_item_id, event_id, holder_id, attendee_name)
    values (item_id, event_id, seeker.id, seeker.display_name);
  end loop;

  raise notice 'QA welcome event created with 6 attendees.';
end
$$;
