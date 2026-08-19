-- =============================================================================
-- MSN — 0004 · Commerce: orders, bookings, refunds, tokens
-- =============================================================================
-- Every money row records which rail it moved on. That matters because an
-- Apple IAP purchase can only be refunded by Apple — the app has to be able to
-- tell the customer where to go, and no amount of policy wording changes it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Orders — buying tickets to an event
-- -----------------------------------------------------------------------------
create table orders (
  id                  uuid primary key default gen_random_uuid(),
  reference           text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),

  buyer_id            uuid not null references profiles(id) on delete restrict,
  event_id            uuid not null references events(id) on delete restrict,
  occurrence_id       uuid references event_occurrences(id) on delete set null,

  status              order_status not null default 'pending',
  rail                payment_rail not null,

  currency            char(3) not null default 'USD',
  subtotal_cents      integer not null default 0 check (subtotal_cents >= 0),
  discount_cents      integer not null default 0 check (discount_cents >= 0),
  tax_cents           integer not null default 0 check (tax_cents >= 0),
  platform_fee_cents  integer not null default 0 check (platform_fee_cents >= 0),
  total_cents         integer not null default 0 check (total_cents >= 0),
  tokens_spent        integer not null default 0 check (tokens_spent >= 0),

  -- Rail-specific identifiers. Exactly one set should be populated.
  stripe_payment_intent_id text,
  store_transaction_id     text,   -- Apple/Google original transaction id

  purchased_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint orders_paid_has_timestamp
    check (status <> 'paid' or purchased_at is not null)
);

create index orders_buyer_idx on orders (buyer_id, created_at desc);
create index orders_event_idx on orders (event_id);
create unique index orders_stripe_intent_idx on orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

comment on column orders.rail is
  'Which payment rail took the money. Determines who can refund it. apple_iap and google_play are refundable only by the store.';

-- Line items
create table order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  ticket_type_id  uuid not null references ticket_types(id) on delete restrict,
  quantity        smallint not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  unit_token_cost smallint
);

create index order_items_order_idx on order_items (order_id);

-- Issued tickets — one row per admitted person, so check-in works
create table tickets (
  id              uuid primary key default gen_random_uuid(),
  order_item_id   uuid not null references order_items(id) on delete cascade,
  event_id        uuid not null references events(id) on delete restrict,
  holder_id       uuid references profiles(id) on delete set null,

  code            text unique not null default encode(gen_random_bytes(9), 'hex'),
  attendee_name   text,
  attendee_email  citext,

  checked_in_at   timestamptz,
  checked_in_by   uuid references profiles(id) on delete set null,
  is_void         boolean not null default false,

  created_at      timestamptz not null default now()
);

create index tickets_event_idx on tickets (event_id);
create index tickets_holder_idx on tickets (holder_id);

-- -----------------------------------------------------------------------------
-- Bookings — reserving a one-to-one service
-- -----------------------------------------------------------------------------
create table bookings (
  id                  uuid primary key default gen_random_uuid(),
  reference           text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),

  seeker_id           uuid not null references profiles(id) on delete restrict,
  provider_id         uuid not null references profiles(id) on delete restrict,
  service_id          uuid not null references services(id) on delete restrict,

  status              booking_status not null default 'requested',

  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  timezone            text not null default 'UTC',
  meeting_url         text,

  -- Snapshot of the cancellation window at time of booking, so later edits to
  -- the service don't retroactively change what the seeker agreed to.
  cancellation_window_hours smallint not null,

  rail                payment_rail not null,
  currency            char(3) not null default 'USD',
  total_cents         integer not null default 0 check (total_cents >= 0),
  platform_fee_cents  integer not null default 0 check (platform_fee_cents >= 0),
  tokens_spent        integer not null default 0 check (tokens_spent >= 0),
  stripe_payment_intent_id text,
  store_transaction_id     text,

  seeker_note         text,
  provider_note       text,

  confirmed_at        timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint bookings_end_after_start check (ends_at > starts_at)
);

create index bookings_seeker_idx on bookings (seeker_id, starts_at desc);
create index bookings_provider_idx on bookings (provider_id, starts_at desc);

create trigger bookings_set_updated_at
  before update on bookings
  for each row execute function set_updated_at();

comment on column bookings.cancellation_window_hours is
  'Copied from services at booking time. Refund policy §2.3 says undisclosed terms are not binding — snapshotting is how that is guaranteed.';

-- -----------------------------------------------------------------------------
-- Refunds
-- -----------------------------------------------------------------------------
create table refund_requests (
  id              uuid primary key default gen_random_uuid(),

  requester_id    uuid not null references profiles(id) on delete restrict,
  order_id        uuid references orders(id) on delete cascade,
  booking_id      uuid references bookings(id) on delete cascade,

  status          refund_status not null default 'requested',
  reason          text not null,
  decision_note   text,

  amount_cents    integer check (amount_cents is null or amount_cents >= 0),
  tokens_issued   integer not null default 0 check (tokens_issued >= 0),

  -- Policy §4.2: acknowledge in 1 business day, decide within 3.
  acknowledged_at timestamptz,
  decided_at      timestamptz,
  processed_at    timestamptz,
  decided_by      uuid references profiles(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Exactly one subject.
  constraint refund_targets_one_thing check (
    (order_id is not null and booking_id is null) or
    (order_id is null and booking_id is not null)
  )
);

create index refund_requests_requester_idx on refund_requests (requester_id, created_at desc);
create index refund_requests_open_idx on refund_requests (status) where status = 'requested';

create trigger refund_requests_set_updated_at
  before update on refund_requests
  for each row execute function set_updated_at();

comment on table refund_requests is
  'Covers BOTH orders and bookings. The Laravel app only has a refund workflow for orders — appointments have no request object at all, which is why policy v2.0 §4 is currently unimplementable there.';

-- -----------------------------------------------------------------------------
-- Tokens — tiered, issued only as a remedy, never sold
-- -----------------------------------------------------------------------------
-- An append-only ledger. Balance is the sum, never a stored column, so it
-- cannot drift.
create table token_ledger (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles(id) on delete cascade,

  delta         integer not null check (delta <> 0),   -- + issued, - spent
  reason        text not null check (reason in (
                  'refund_alternative','goodwill','promotional',
                  'spent_on_order','spent_on_booking','admin_adjustment','expired_reversal'
                )),

  refund_request_id uuid references refund_requests(id) on delete set null,
  order_id      uuid references orders(id) on delete set null,
  booking_id    uuid references bookings(id) on delete set null,
  note          text,

  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index token_ledger_profile_idx on token_ledger (profile_id, created_at desc);

comment on table token_ledger is
  'Tokens are never sold (policy §16.6) and never expire (§16.4). Append-only: corrections are new rows, not updates.';

create or replace function token_balance(p_profile uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(delta), 0)::integer from token_ledger where profile_id = p_profile;
$$;

-- Tier reference. Used to price offerings in tokens.
create table token_tiers (
  tier        smallint primary key,
  label       text not null,
  tokens      smallint not null check (tokens > 0),
  description text
);

insert into token_tiers (tier, label, tokens, description) values
  (1, 'Session',  1,  'Single session, class, meditation, consultation'),
  (2, 'Workshop', 3,  'Workshop, half-day experience'),
  (3, 'Training', 8,  'Full-day training, intensive'),
  (4, 'Retreat',  25, 'Multi-day retreat, residential programme')
on conflict (tier) do nothing;
