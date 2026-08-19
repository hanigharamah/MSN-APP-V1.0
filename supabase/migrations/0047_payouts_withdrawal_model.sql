-- Payouts, on the old app's model: hold the money, pay out on request.
--
-- ## Which model this is, and what it costs
--
-- Two shapes were on the table. Stripe's recommended one for a marketplace is
-- DESTINATION CHARGES: the money splits at the moment of payment and the
-- practitioner's share never sits in the platform's balance at all.
--
-- This is the other one, matching the existing Laravel app: the platform takes
-- 100% of every payment and holds it, the practitioner asks for a withdrawal,
-- an admin approves, and only then does a Stripe transfer go out.
--
-- Chosen deliberately, with the trade understood. It buys control — funds do
-- not leave until someone says so, which is useful while refunds are still
-- admin-approved. It costs three things:
--
--   1. **Regulatory exposure.** Holding money for other people is the fact
--      pattern that money-transmission licensing turns on. In the US that is
--      state by state; in Mexico, holding client funds requires an IFPE licence
--      from CNBV and there is no exemption to argue about. Being a Stripe
--      platform does not transfer Stripe's licences to us. UK/GBP is the
--      current market; this needs counsel before either of those.
--   2. **Operational load.** Every payout is a human decision. Fine at ten
--      practitioners, painful at a thousand.
--   3. **Float.** An unclaimed balance is our liability sitting in our account.
--
-- If the model is ever revisited, the thing to change is where the split
-- happens — in `create-checkout`, not here.
--
-- ## Money is never computed on the client
--
-- `my_payout_balance` is security definer and reads `auth.uid()`. Nothing takes
-- an amount from the app and trusts it: `request_withdrawal` recomputes the
-- available balance inside the same statement that inserts the request, so two
-- taps cannot both pass a check that only one of them should.

-- -----------------------------------------------------------------------------
-- Connected account state
-- -----------------------------------------------------------------------------
-- `stripe_account_id` already existed, unused. These record what Stripe says
-- about the account, refreshed from the `account.updated` webhook — never
-- inferred locally, because only Stripe knows whether onboarding is complete.

alter table provider_details
  add column stripe_payouts_enabled   boolean not null default false,
  add column stripe_details_submitted boolean not null default false,
  add column stripe_account_synced_at timestamptz;

comment on column provider_details.stripe_payouts_enabled is
  'Mirrors Stripe''s payouts_enabled. Set from the account.updated webhook only.';

-- -----------------------------------------------------------------------------
-- Withdrawal requests
-- -----------------------------------------------------------------------------

create table withdrawal_requests (
  id           uuid primary key default gen_random_uuid(),
  provider_id  uuid not null references profiles(id) on delete restrict,

  amount_cents integer not null check (amount_cents > 0),
  currency     char(3) not null,

  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'failed')),
  admin_note   text,

  -- Present once a transfer has actually succeeded. Its absence on an approved
  -- row means the money did not move, which is the case worth finding fast.
  stripe_transfer_id text unique,

  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references profiles(id) on delete set null,

  -- A decision must record when it was made and who made it. Same reasoning as
  -- `orders_paid_has_timestamp`: a status without its timestamp is a row that
  -- cannot be audited later.
  constraint withdrawal_decision_is_complete check (
    status = 'pending'
    or (decided_at is not null and decided_by is not null)
  )
);

create index withdrawal_requests_provider_idx on withdrawal_requests (provider_id, requested_at desc);
create index withdrawal_requests_pending_idx on withdrawal_requests (requested_at)
  where status = 'pending';

alter table withdrawal_requests enable row level security;

create policy "providers see their own withdrawals"
  on withdrawal_requests for select
  using (provider_id = auth.uid() or auth_is_admin());

-- Deliberately no INSERT policy: requests are created through
-- `request_withdrawal`, which checks the balance. An insert policy would let
-- somebody request more than they have earned.

create policy "admins decide withdrawals"
  on withdrawal_requests for update
  using (auth_is_admin()) with check (auth_is_admin());

comment on table withdrawal_requests is
  'A practitioner asking to be paid. Created only via request_withdrawal(); decided only by an admin.';
