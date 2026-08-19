-- What a practitioner is owed, and how they ask for it.
--
-- Earnings reuse the same definition the admin money view already uses
-- (`admin_organiser_balances`, migration 0026): event orders attribute to the
-- event's host, bookings to the provider, bypassed payments excluded because
-- no real money moved. Two different answers to "what has this person earned"
-- would be worse than none.

create or replace function my_payout_balance()
returns table (
  currency        char(3),
  earned_cents    bigint,
  withdrawn_cents bigint,
  pending_cents   bigint,
  available_cents bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with earned as (
    select o.currency, o.total_cents, o.platform_fee_cents
      from orders o
      join events e on e.id = o.event_id
     where o.status = 'paid'
       and coalesce(o.payment_bypassed, false) = false
       and e.host_id = auth.uid()

    union all

    select b.currency, b.total_cents, b.platform_fee_cents
      from bookings b
     where b.status in ('confirmed', 'completed')
       and coalesce(b.payment_bypassed, false) = false
       and b.provider_id = auth.uid()
  ),
  totals as (
    select currency, sum(total_cents - platform_fee_cents)::bigint as earned
      from earned group by currency
  ),
  taken as (
    select currency,
           sum(amount_cents) filter (where status = 'approved')::bigint as withdrawn,
           sum(amount_cents) filter (where status = 'pending')::bigint  as pending
      from withdrawal_requests
     where provider_id = auth.uid()
     group by currency
  )
  select
    coalesce(t.currency, k.currency),
    coalesce(t.earned, 0),
    coalesce(k.withdrawn, 0),
    coalesce(k.pending, 0),
    -- Pending requests are subtracted as well as approved ones. Money asked for
    -- is money already spoken for; showing it as available invites a second
    -- request for the same funds.
    coalesce(t.earned, 0) - coalesce(k.withdrawn, 0) - coalesce(k.pending, 0)
  from totals t
  full outer join taken k on k.currency = t.currency;
$$;

comment on function my_payout_balance is
  'Earnings, withdrawals and what is left, for the signed-in practitioner. Pending requests count against available.';

revoke execute on function my_payout_balance() from anon;

-- =============================================================================
-- request_withdrawal
-- =============================================================================
-- The balance check and the insert are one statement on purpose. Checking in
-- the app and inserting afterwards leaves a window where two taps both pass —
-- the classic double-spend, and the reason there is no INSERT policy on the
-- table.

create or replace function request_withdrawal(p_amount_cents integer, p_currency char(3))
returns withdrawal_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  available bigint;
  created   withdrawal_requests;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Enter an amount to withdraw.' using errcode = '22003';
  end if;

  -- Payouts cannot be sent to an account Stripe has not finished verifying, so
  -- refusing here is kinder than accepting a request that must later be
  -- rejected by a human for a reason the practitioner cannot see.
  if not exists (
    select 1 from provider_details
     where profile_id = auth.uid() and stripe_payouts_enabled
  ) then
    raise exception 'Finish setting up payouts before requesting one.'
      using errcode = '42501';
  end if;

  select b.available_cents into available
    from my_payout_balance() b
   where b.currency = p_currency;

  if coalesce(available, 0) < p_amount_cents then
    raise exception 'That is more than your available balance.'
      using errcode = '22003';
  end if;

  insert into withdrawal_requests (provider_id, amount_cents, currency)
  values (auth.uid(), p_amount_cents, p_currency)
  returning * into created;

  return created;
end;
$$;

comment on function request_withdrawal is
  'Creates a withdrawal request after checking the available balance in the same statement. The only way a request can be created.';

revoke execute on function request_withdrawal(integer, char) from anon;
