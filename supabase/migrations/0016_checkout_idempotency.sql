-- =============================================================================
-- MSN — 0016 · Request-level idempotency for checkout
-- =============================================================================
-- QA proved against the live function that two concurrent identical calls to
-- `create-checkout` produce TWO paid orders, FOUR tickets and `quantity_sold`
-- moved by four. The buyer is charged twice.
--
-- The existing Stripe idempotency key is `order:<id>`, handed to Stripe only
-- AFTER the order row is inserted — so it stops one order producing two
-- PaymentIntents, but does nothing about one intent producing two orders.
--
-- Client-side locks were added (an in-flight ref, a non-dismissible sheet), but
-- those cannot survive a retried request on a flaky connection, which is
-- exactly when a lost response makes the client retry. Idempotency has to live
-- where the write happens.
--
-- `idempotency_key` is supplied by the client, unique per checkout ATTEMPT (not
-- per render). A retry reuses it and gets the original order back instead of a
-- second one.
-- =============================================================================

alter table orders
  add column if not exists idempotency_key text;

-- Scoped to the buyer: two people can never collide, and a stolen key is
-- useless against another account.
create unique index if not exists orders_idempotency_key_uniq
  on orders (buyer_id, idempotency_key)
  where idempotency_key is not null;

comment on column orders.idempotency_key is
  'Client-supplied, unique per checkout attempt. A retry of the same attempt returns the original order rather than creating a second one. Unique per buyer — see migration 0016.';

-- Same exposure on bookings: `book-service` inserts before taking payment too.
alter table bookings
  add column if not exists idempotency_key text;

create unique index if not exists bookings_idempotency_key_uniq
  on bookings (seeker_id, idempotency_key)
  where idempotency_key is not null;

comment on column bookings.idempotency_key is
  'Client-supplied, unique per booking attempt. See orders.idempotency_key and migration 0016.';
