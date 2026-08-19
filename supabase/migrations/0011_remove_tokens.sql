-- =============================================================================
-- MSN — 0011 · Remove the token system
-- =============================================================================
-- Tokens were a proposal, not an approved feature. Removing rather than leaving
-- dormant so nothing can ship by accident and so the schema reflects what the
-- product actually does.
--
-- Safe to run: the database contains no rows in any affected table, and no
-- order or booking has ever used the 'tokens' rail.
--
-- If tokens are approved later, this migration is the spec for putting them
-- back — see git history for 0004_commerce.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tables and functions
-- -----------------------------------------------------------------------------
drop function if exists token_balance(uuid);

-- Policies go with the tables.
drop table if exists token_ledger;
drop table if exists token_tiers;

-- -----------------------------------------------------------------------------
-- Columns
-- -----------------------------------------------------------------------------
alter table orders          drop column if exists tokens_spent;
alter table bookings        drop column if exists tokens_spent;
alter table ticket_types    drop column if exists token_cost;
alter table services        drop column if exists token_cost;
alter table refund_requests drop column if exists tokens_issued;

-- -----------------------------------------------------------------------------
-- Drop 'tokens' from the payment_rail enum
-- -----------------------------------------------------------------------------
-- Postgres cannot remove an enum member in place, so the type is rebuilt and
-- the dependent columns are re-typed through text. No row currently holds
-- 'tokens', so the cast cannot fail.
-- -----------------------------------------------------------------------------
alter type payment_rail rename to payment_rail_old;

create type payment_rail as enum (
  'stripe',
  'apple_iap',
  'google_play'
);

alter table orders
  alter column rail type payment_rail using rail::text::payment_rail;

alter table bookings
  alter column rail type payment_rail using rail::text::payment_rail;

drop type payment_rail_old;

comment on type payment_rail is
  'Which rail took the money. Determines who can refund it — apple_iap and google_play are refundable only by the store.';
