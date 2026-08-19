-- Put the day retreat back on Discover.
--
-- `Slow Sunday: A Day Retreat` was seeded as a draft on purpose — the seed
-- comment says it exists "so the app has an unpublished event to render on the
-- host dashboard". That demo case is kept: `Supper Club — Autumn` is still a
-- draft and does the same job. This one is wanted on the marketplace.
--
-- It also had no ticket types, which is the real reason it could not simply be
-- flipped: a published event with nothing to buy is a listing that refuses
-- every tap on Book. So the tier is created here rather than left for someone
-- to discover at the till.
--
-- Dates are pushed forward on every run, so re-applying this migration keeps
-- the retreat comfortably in the future instead of quietly ageing into the
-- past the way the rest of the demo data has.

do $$
declare
  v_event uuid := 'e0000000-0000-4000-a000-000000000003'::uuid;
  v_tt    uuid := 'e0000000-0000-4000-a000-0000000000d3'::uuid;
begin
  if not exists (select 1 from events where id = v_event) then
    raise notice 'Day retreat not present — nothing to publish.';
    return;
  end if;

  -- A whole-day retreat reads wrong at 10:00–17:00 on a Tuesday, so it is
  -- placed on the next Sunday five weeks out.
  update events
     set status       = 'published',
         published_at = coalesce(published_at, now()),
         starts_at    = (date_trunc('week', current_date + 35) + interval '6 days')::date + time '10:00',
         ends_at      = (date_trunc('week', current_date + 35) + interval '6 days')::date + time '17:00',
         cover_url    = 'https://picsum.photos/seed/msn-retreat/1200/600'
   where id = v_event;

  if not exists (select 1 from ticket_types where event_id = v_event) then
    insert into ticket_types (id, event_id, name, description, price_cents, currency, quantity)
    values (
      v_tt, v_event, 'Full day',
      'Movement, bodywork, silence and lunch. Everything included.',
      6500, 'GBP', 12
    );
    raise notice 'Ticket tier created for the day retreat.';
  end if;

  raise notice 'Day retreat published.';
end
$$;
