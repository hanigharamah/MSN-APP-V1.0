-- =============================================================================
-- MSN — 0018 · Mark rows completed by the payment bypass
-- =============================================================================
-- The bypass (ALLOW_PAYMENT_BYPASS) completes paid orders and bookings without
-- taking money, so the product can be exercised before Stripe is configured.
--
-- Anything it touches is test data, not revenue. Without a marker those rows
-- are indistinguishable from real paid ones in every report, payout total and
-- refund decision forever after. This column is how they get found and removed.
-- =============================================================================

alter table orders   add column if not exists payment_bypassed boolean not null default false;
alter table bookings add column if not exists payment_bypassed boolean not null default false;

create index if not exists orders_bypassed_idx   on orders (payment_bypassed)   where payment_bypassed;
create index if not exists bookings_bypassed_idx on bookings (payment_bypassed) where payment_bypassed;

comment on column orders.payment_bypassed is
  'True when completed by ALLOW_PAYMENT_BYPASS without a real payment. Test data — exclude from revenue and delete before launch.';
comment on column bookings.payment_bypassed is
  'True when completed by ALLOW_PAYMENT_BYPASS without a real payment. Test data — exclude from revenue and delete before launch.';
