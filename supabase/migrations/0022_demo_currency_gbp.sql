-- One currency for the demo data.
--
-- The first seed pass wrote a mix — GBP, EUR and one USD — across events,
-- ticket types and services whose venues are all London, Manchester and
-- Hay-on-Wye. Discover therefore showed "From €22" on a card that then gave a
-- London address, which reads as a bug in the pricing rather than a seed
-- inconsistency, and undermines every number on the screen.
--
-- Scope: demo rows only. This is NOT a rule that MSN is single-currency —
-- `currency` stays per-row precisely because a practitioner in Berlin should be
-- able to charge in euro. This corrects seeded values that contradict their own
-- addresses.
--
-- ## Why this is scoped per row rather than a blanket update
--
-- A first version of this migration aborted if ANY order existed. It fired:
-- there are paid orders in this data. But those orders are all against GBP
-- listings, and refusing everything because something unrelated was sold is the
-- wrong trade — it left every price on Discover inconsistent to protect rows
-- that were never at risk.
--
-- So each statement excludes anything money has touched. A sold listing keeps
-- the currency it was sold in, permanently: an order records what a person was
-- charged, and repricing the listing underneath it would make the receipt and
-- the product disagree. Silently changing GBP to EUR on a ticket someone has
-- already paid for is the exact failure this guards.

-- Ticket types: only where none have been sold AND no order item points at them.
-- `quantity_sold` alone is not enough — it is a denormalised counter, and an
-- order item is the actual record of a purchase.
update ticket_types tt
   set currency = 'GBP'
 where tt.currency <> 'GBP'
   and coalesce(tt.quantity_sold, 0) = 0
   and not exists (
     select 1 from order_items oi where oi.ticket_type_id = tt.id
   );

-- Services: only where nothing has been booked against them, for the same
-- reason — a booking pins the price and currency it was agreed at.
update services s
   set currency = 'GBP'
 where s.currency <> 'GBP'
   and not exists (
     select 1 from bookings b where b.service_id = s.id
   );

-- Events last, and only once every ticket type under them agrees. An event
-- whose header says GBP while one of its tickets still says EUR is worse than
-- one that is consistently wrong: the checkout total and the badge on the card
-- would come from different currencies.
update events e
   set currency = 'GBP'
 where e.currency <> 'GBP'
   and not exists (
     select 1 from ticket_types tt
      where tt.event_id = e.id and tt.currency <> 'GBP'
   );

-- Report what, if anything, money has pinned in another currency, so a mixed
-- result is visible in the push output rather than discovered on a card later.
do $$
declare
  stuck integer;
begin
  select (select count(*) from ticket_types where currency <> 'GBP')
       + (select count(*) from services     where currency <> 'GBP')
       + (select count(*) from events       where currency <> 'GBP')
    into stuck;

  if stuck > 0 then
    raise notice
      '% row(s) keep a non-GBP currency because they have been sold or booked. This is deliberate.',
      stuck;
  end if;
end
$$;
