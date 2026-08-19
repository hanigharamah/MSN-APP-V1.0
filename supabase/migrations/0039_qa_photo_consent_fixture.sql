-- QA fixture: give the test account a ticket so the consent card can be seen.
--
-- The card is raised by an unanswered ticket held by the signed-in user, and
-- the QA account only ever hosts — so without this there is nothing to test
-- against. Buying into your own session is unusual but not forbidden, and the
-- alternative is signing in as a seeded seeker whose data every other demo
-- shares.
--
-- It doubles as the proof that `notify_photo_consent` fires: the notice at the
-- end reports whether the trigger produced the ask.
--
-- Every local is prefixed `v_`. Naming one of them `event_id` shadowed the
-- column of the same name and made `where event_id = event_id` ambiguous, which
-- is the kind of thing that only shows up at apply time.
--
-- Demo data. Safe to delete. Re-running only clears the answer so the card is
-- due again.

do $$
declare
  v_qa     uuid := 'a0000000-0000-4000-a000-0000000000aa'::uuid;
  v_event  uuid := 'e0000000-0000-4000-a000-0000000000e1'::uuid;
  v_tt     uuid := 'e0000000-0000-4000-a000-0000000000f1'::uuid;
  v_order  uuid;
  v_item   uuid;
  v_ticket uuid;
  v_asks   integer;
begin
  select id into v_ticket
    from tickets
   where event_id = v_event and holder_id = v_qa
   limit 1;

  if v_ticket is not null then
    update tickets
       set photo_consent = null, photo_consent_at = null
     where id = v_ticket;
    raise notice 'QA consent fixture reset — the card is due again.';
    return;
  end if;

  insert into orders (buyer_id, event_id, status, rail, currency,
                      subtotal_cents, total_cents, platform_fee_cents, purchased_at)
  values (v_qa, v_event, 'paid', 'stripe', 'GBP', 1000, 1100, 100, now())
  returning id into v_order;

  insert into order_items (order_id, ticket_type_id, quantity, unit_price_cents)
  values (v_order, v_tt, 1, 1000)
  returning id into v_item;

  insert into tickets (order_item_id, event_id, holder_id, attendee_name)
  values (v_item, v_event, v_qa, 'QA Tester')
  returning id into v_ticket;

  select count(*) into v_asks
    from notifications
   where profile_id = v_qa
     and kind = 'photo_consent'
     and payload->>'event_id' = v_event::text;

  if v_asks = 1 then
    raise notice 'Trigger fired: 1 photo_consent notification raised.';
  else
    raise warning 'Trigger did NOT fire as expected — % notifications found.', v_asks;
  end if;
end
$$;
