-- Make the retreat label actually fire, and stop the two retreats sharing a
-- photograph.
--
-- Two things surfaced the moment the "Retreat" label went on the Discover card:
--
--   1. `Three Nights in the Hills` — three nights at a barn in the Welsh hills,
--      the most obviously retreat-shaped listing in the catalogue — has no
--      category at all, so there was nothing for the label to key off. It is
--      not alone: `Dawn Swim & River Clean`, `Winter Gong Bath` and one of the
--      two `Breathwork` events are also uncategorised, which means the category
--      filter chips silently skip them too. Only the retreat is fixed here;
--      the rest is a separate piece of demo-data tidying.
--
--   2. Both retreats pointed at `picsum.photos/seed/msn-retreat`. Migration
--      0041 gave the day retreat that seed without checking 0021 had already
--      spent it, so the two sat side by side on Discover showing the same
--      picture — which reads as a duplicate listing rather than two events.

do $$
declare
  v_hills uuid;
  v_slow  uuid := 'e0000000-0000-4000-a000-000000000003'::uuid;
  v_cat   uuid;
begin
  select id into v_hills from events where title = 'Three Nights in the Hills' limit 1;
  select id into v_cat   from categories where slug = 'residential-retreats' limit 1;

  if v_hills is not null and v_cat is not null then
    -- Only fills a gap; never overwrites a category somebody has since chosen.
    update events
       set category_id = v_cat
     where id = v_hills
       and category_id is null;
  end if;

  update events
     set cover_url = 'https://picsum.photos/seed/msn-slow-sunday/1200/600'
   where id = v_slow;

  raise notice 'Retreat categorised and covers separated.';
end
$$;
