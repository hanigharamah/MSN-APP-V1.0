-- What the money is doing.
--
-- Admin could decide refunds one at a time and see no total anywhere. An
-- operator who cannot answer "how much came in this month" or "what do we owe
-- Amara" is flying blind, and those are the two questions that actually get
-- asked.
--
-- ## Two sources, one shape
--
-- Money arrives two ways — `orders` (event tickets) and `bookings` (one-to-one
-- sessions) — and they have to be added together or every total is wrong. Both
-- carry `total_cents` and `platform_fee_cents`, so "owed to the practitioner"
-- is `total - platform_fee` in each case.
--
-- ## Counting only what completed
--
-- Orders count at `paid`; bookings at `confirmed` or `completed`. A pending
-- order is a checkout somebody abandoned, and including those inflates every
-- figure with money that never existed.
--
-- ## Bypassed rows are separated, not hidden
--
-- Payments are currently bypassed (migration 0018), so most rows are marked
-- paid without money moving. Folding those into a revenue figure would make
-- the number a lie. Every total is therefore returned twice: the real one, and
-- what is bypassed — so the screen can say "£0 real, £420 simulated" instead
-- of "£420".

-- -----------------------------------------------------------------------------
-- Headline
-- -----------------------------------------------------------------------------

create or replace function admin_money_summary()
returns table (
  currency          char(3),
  gross_cents       bigint,
  platform_fee_cents bigint,
  owed_cents        bigint,
  transaction_count bigint,
  bypassed_cents    bigint,
  bypassed_count    bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with all_money as (
    select
      o.currency,
      o.total_cents,
      o.platform_fee_cents,
      coalesce(o.payment_bypassed, false) as bypassed
    from orders o
    where o.status = 'paid'

    union all

    select
      b.currency,
      b.total_cents,
      b.platform_fee_cents,
      coalesce(b.payment_bypassed, false) as bypassed
    from bookings b
    where b.status in ('confirmed', 'completed')
  )
  select
    m.currency,
    sum(m.total_cents) filter (where not m.bypassed)::bigint,
    sum(m.platform_fee_cents) filter (where not m.bypassed)::bigint,
    sum(m.total_cents - m.platform_fee_cents) filter (where not m.bypassed)::bigint,
    count(*) filter (where not m.bypassed)::bigint,
    coalesce(sum(m.total_cents) filter (where m.bypassed), 0)::bigint,
    count(*) filter (where m.bypassed)::bigint
  from all_money m
  -- Admin only. `security definer` means this reads past RLS, so the gate has
  -- to be inside the query rather than left to a policy.
  where auth_is_admin()
  group by m.currency
  order by 2 desc nulls last;
$$;

comment on function admin_money_summary is
  'Totals across paid orders and confirmed bookings, per currency, with bypassed (simulated) amounts reported separately so no figure silently includes money that never moved.';

-- -----------------------------------------------------------------------------
-- Per practitioner
-- -----------------------------------------------------------------------------

/*
 * What each practitioner has earned, and therefore what is owed to them.
 *
 * Attribution differs by source and it matters: a booking is earned by
 * `provider_id`, an event order by the event's `host_id`. Using the buyer on
 * either would credit the wrong person entirely.
 */
create or replace function admin_organiser_balances(limit_n integer default 50)
returns table (
  profile_id     uuid,
  display_name   text,
  handle         citext,
  avatar_url     text,
  currency       char(3),
  gross_cents    bigint,
  owed_cents     bigint,
  transaction_count bigint,
  bypassed_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with earned as (
    select
      e.host_id as profile_id,
      o.currency,
      o.total_cents,
      o.platform_fee_cents,
      coalesce(o.payment_bypassed, false) as bypassed
    from orders o
    join events e on e.id = o.event_id
    where o.status = 'paid'

    union all

    select
      b.provider_id,
      b.currency,
      b.total_cents,
      b.platform_fee_cents,
      coalesce(b.payment_bypassed, false) as bypassed
    from bookings b
    where b.status in ('confirmed', 'completed')
  )
  select
    p.id,
    p.display_name,
    p.handle,
    p.avatar_url,
    x.currency,
    sum(x.total_cents) filter (where not x.bypassed)::bigint,
    sum(x.total_cents - x.platform_fee_cents) filter (where not x.bypassed)::bigint,
    count(*) filter (where not x.bypassed)::bigint,
    count(*) filter (where x.bypassed)::bigint
  from earned x
  join profiles p on p.id = x.profile_id
  where auth_is_admin()
  group by p.id, p.display_name, p.handle, p.avatar_url, x.currency
  -- Biggest owed first: that is the list an operator works down.
  order by 7 desc nulls last, 6 desc nulls last
  limit coalesce(limit_n, 50);
$$;

comment on function admin_organiser_balances is
  'Per-practitioner earnings and balance owed. Event orders attribute to the event host, bookings to the provider.';

-- -----------------------------------------------------------------------------
-- Recent transactions
-- -----------------------------------------------------------------------------

create or replace function admin_recent_transactions(limit_n integer default 40)
returns table (
  kind          text,
  id            uuid,
  reference     text,
  occurred_at   timestamptz,
  currency      char(3),
  total_cents   integer,
  bypassed      boolean,
  rail          payment_rail,
  counterparty  text,
  subject       text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    'order'::text,
    o.id,
    o.reference,
    o.created_at,
    o.currency,
    o.total_cents,
    coalesce(o.payment_bypassed, false),
    o.rail,
    buyer.display_name,
    e.title
  from orders o
  join profiles buyer on buyer.id = o.buyer_id
  join events e on e.id = o.event_id
  where o.status = 'paid' and auth_is_admin()

  union all

  select
    'booking'::text,
    b.id,
    b.reference,
    b.created_at,
    b.currency,
    b.total_cents,
    coalesce(b.payment_bypassed, false),
    b.rail,
    seeker.display_name,
    coalesce(s.title, 'Session')
  from bookings b
  join profiles seeker on seeker.id = b.seeker_id
  left join services s on s.id = b.service_id
  where b.status in ('confirmed', 'completed') and auth_is_admin()

  order by 4 desc
  limit coalesce(limit_n, 40);
$$;

comment on function admin_recent_transactions is
  'The most recent completed money movements across both orders and bookings, newest first.';
