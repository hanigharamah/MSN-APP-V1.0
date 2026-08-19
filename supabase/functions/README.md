# MSN — Supabase Edge Functions

Deno/TypeScript functions covering the money paths: ticket checkout, Stripe
webhooks, service bookings, refunds, and push fan-out.

These are the "Not included yet" bullet from `supabase/README.md`. They assume
migrations `0001`–`0006` have already been applied.

> **Written against `0001`–`0006`.** Migrations `0007`–`0009` landed while these
> functions were being written. Nothing they change breaks this code — the enums,
> and every column these functions read or write, are unchanged — but see
> "Overlap with `0008_functions.sql`" under `book-service` below.

```
functions/
  _shared/            imported by everything, never deployed on its own
    cors.ts           CORS headers and preflight
    env.ts            every secret read, in one place
    errors.ts         ApiError, JSON responses, the serveJson wrapper
    validate.ts       input assertions
    supabase.ts       service-role client + caller identity
    money.ts          integer-cent arithmetic, fees, tax
    time.ts           timezone maths for availability rules
    stripe.ts         Stripe client configured for Deno
    inventory.ts      compare-and-swap on ticket_types.quantity_sold
    fulfilment.ts     paid order -> tickets (idempotent)
    notify.ts         notifications table + Expo push
  create-checkout/
  stripe-webhook/
  book-service/
  request-refund/
  process-refund/
  send-push/
```

---

## Principles these functions hold to

**The client never sets a price.** Every amount is read from `ticket_types` or
`services` inside the function. A `price_cents` in a request body is ignored,
not validated — there is no code path that reads one.

**Money is integer cents.** No floats, no currency parsing. `_shared/money.ts`
owns the arithmetic, and rounding is half-up on basis points.

**RLS is not bypassed casually.** `0006_rls.sql` deliberately gives clients no
UPDATE path into `orders`, `tickets` or `refund_requests`. These functions hold the
service-role key so they can do those writes — but caller identity always comes
from the caller's own JWT (`requireUser`), never from the service-role client.

**Errors say what to do.** Every error carries `code`, `message`, and `fix`.

```json
{
  "error": {
    "code": "sales_closed",
    "message": "Sales for \"Early Bird\" closed at 2026-08-01T18:00:00Z.",
    "fix": "Show the closed state. This ticket type cannot be bought any more.",
    "details": { "ticket_type_id": "…", "sales_end_at": "2026-08-01T18:00:00Z" }
  }
}
```

**The store rail is a hard boundary.** `apple_iap` and `google_play` purchases
are refundable only by the store. `request-refund` refuses to create a refund
request for them and returns the store's URL instead.

---

## Environment variables

Set with `supabase secrets set NAME=value`.

| Name | Required | Default | Used by | What it does |
|---|---|---|---|---|
| `SUPABASE_URL` | auto | — | all | Injected by the platform. |
| `SUPABASE_SERVICE_ROLE_KEY` | auto | — | all | Injected by the platform. Bypasses RLS; also the shared secret `send-push` accepts for server-to-server calls. |
| `STRIPE_SECRET_KEY` | yes | — | create-checkout, book-service, process-refund, stripe-webhook | Stripe API key. `sk_test_…` / `sk_live_…`. |
| `STRIPE_WEBHOOK_SECRET` | yes | — | stripe-webhook | Signing secret for **this** endpoint. Per-endpoint and per-mode — the test and live secrets differ. |
| `STRIPE_PUBLISHABLE_KEY` | no | `null` | create-checkout, book-service | Returned to the client so the app doesn't have to ship it. |
| `PLATFORM_FEE_BPS` | no | `1000` | checkout, booking | Platform fee in basis points. `1000` = 10%. |
| `TAX_BPS` | no | `0` | checkout | **Placeholder.** Flat rate on the taxable amount. See "Schema gaps" — real tax needs Stripe Tax or a rates table. |
| `EXPO_ACCESS_TOKEN` | no | — | send-push and every function that notifies | Required only if the Expo project has push security enabled. |
| `APP_DEEP_LINK_SCHEME` | no | `msn` | all | Scheme for `notifications.deep_link`, e.g. `msn://order/<id>`. |
| `ALLOWED_ORIGIN` | no | `*` | all | Tighten for the web build. |
| `DEBUG_ERRORS` | no | `false` | all | `true` echoes internal error messages in 500 responses. Never enable in production. |

---

## Deploying

```bash
supabase functions deploy create-checkout
supabase functions deploy book-service
supabase functions deploy request-refund
supabase functions deploy process-refund
supabase functions deploy send-push

# Stripe does not send a Supabase JWT — this one must skip verification.
supabase functions deploy stripe-webhook --no-verify-jwt
```

Or pin it in `supabase/config.toml` so nobody has to remember the flag:

```toml
[functions.stripe-webhook]
verify_jwt = false
```

> `config.toml` lives outside `functions/` and is not created by this work.
> Add the stanza, or always deploy that one function with `--no-verify-jwt`.
> The Stripe signature is the authentication for that endpoint, and it is
> stronger than a bearer token would be.

Then point a Stripe webhook endpoint at
`https://<project-ref>.functions.supabase.co/stripe-webhook` subscribed to
`payment_intent.succeeded` and `payment_intent.payment_failed`, and copy its
signing secret into `STRIPE_WEBHOOK_SECRET`.

---

## `create-checkout`

Validates a ticket selection, writes a `pending` order plus `order_items`, and
returns a Stripe PaymentIntent client secret.

**Auth:** signed-in user (the buyer).
**Method:** `POST`

```jsonc
{
  "event_id": "1c3f…",
  "occurrence_id": null,                 // optional, for recurring events
  "items": [
    { "ticket_type_id": "9ab2…", "quantity": 2 }
  ],
  "platform": "ios"                      // optional: ios | android | web
}
```

Shorthand for a single ticket type: `{ "event_id": …, "ticket_type_id": …, "quantity": 2 }`.

**201**

```jsonc
{
  "order_id": "…",
  "reference": "A1B2C3D4E5",
  "status": "pending",
  "currency": "USD",
  "amounts": {
    "subtotal_cents": 9000, "discount_cents": 0, "tax_cents": 0,
    "platform_fee_cents": 900, "total_cents": 9900
  },
  "free": false,
  "payment": {
    "provider": "stripe",
    "client_secret": "pi_…_secret_…",
    "payment_intent_id": "pi_…",
    "publishable_key": "pk_test_…"
  }
}
```

**What it checks**

- Event exists, is `published`, has not ended, and is not the caller's own.
- Occurrence, if given, belongs to the event and is not cancelled.
- Each ticket type belongs to the event and is `is_active`.
- Sales window: `sales_start_at <= now < sales_end_at`.
- `quantity <= max_per_order`, with duplicate line items merged first so the
  cap cannot be dodged by repeating a ticket type.
- `quantity <= quantity - quantity_sold` where `quantity` is not null.
- All ticket types share a currency.
- Total clears Stripe's 50-minor-unit minimum.
- **Apple 3.1.3(d):** an `online_live` event cannot be sold through Stripe when
  `platform` is `ios` or `android` — 403 telling the client to open the store
  purchase sheet instead.

**Notable error codes:** `event_not_on_sale`, `event_has_ended`,
`ticket_type_not_found`, `ticket_type_inactive`, `sales_not_open`,
`sales_closed`, `over_max_per_order`, `insufficient_inventory`,
`mixed_currency`, `below_minimum_charge`.

**Free events** (`total_cents === 0`) skip Stripe entirely: the order is marked
paid and tickets are issued inline. The response has `"free": true` and
`"payment": null`.

---

## `stripe-webhook`

The only thing in this codebase that marks an order paid.

**Auth:** Stripe signature (`stripe-signature` header) — **not** a Supabase JWT.
**Events:** `payment_intent.succeeded`, `payment_intent.payment_failed`.
Anything else gets a `200 {"handled": false}` so Stripe stops retrying it.

Routing is by `metadata.kind` on the PaymentIntent: `order` (default) or
`booking`.

### On `payment_intent.succeeded` for an order

1. Compare-and-swap `orders.status` `pending` → `paid`, stamping `purchased_at`.
2. For each `order_item`, count existing `tickets` and insert only the
   shortfall.
3. Raise `ticket_types.quantity_sold` by the number of tickets *this pass*
   actually created.
4. Notify the buyer and the host (deduped).

### Idempotency

Stripe redelivery is a contract, not an edge case, and the schema has no
`processed_events` table to dedupe against. So idempotency is derived from state
that already exists:

- The status CAS can only be won once.
- Ticket issuance is **convergent, not incremental** — a second delivery
  computes a shortfall of zero and inserts nothing.
- `quantity_sold` moves by the count created in this pass, so a redelivery moves
  it by zero.

The useful consequence: winning the CAS is not load-bearing. If the function
dies after marking the order paid but before issuing tickets, the redelivery
loses the race, falls through, and finishes the job. The repair path and the
happy path are the same code.

A late webhook for an order that is `refunded` or `cancelled` never issues
tickets — the status check happens before fulfilment.

### Response codes

`200` for anything settled (including a no-op redelivery). `400` for a bad or
missing signature. `500` for a handler failure, deliberately, so Stripe retries
— the handlers are safe to run again.

---

## `book-service`

**Auth:** signed-in user (the seeker).
**Method:** `POST`

```jsonc
{
  "service_id": "…",
  "starts_at": "2026-09-01T14:00:00Z",   // UTC instant
  "timezone": "America/New_York",        // optional, display only
  "seeker_note": "First session",        // optional
  "platform": "ios"                      // optional
}
```

**201**

```jsonc
{
  "booking_id": "…",
  "reference": "F7G8H9J0K1",
  "status": "requested",                 // or "confirmed"
  "starts_at": "2026-09-01T14:00:00Z",
  "ends_at": "2026-09-01T15:00:00Z",
  "requires_approval": true,
  "cancellation_window_hours": 24,
  "free_cancellation_until": "2026-08-31T14:00:00Z",
  "amounts": { "price_cents": 12000, "platform_fee_cents": 1200, "total_cents": 13200, "currency": "USD" },
  "free": false,
  "payment": { "provider": "stripe", "client_secret": "…", "payment_intent_id": "…" }
}
```

**Four independent slot checks**

1. **`availability_rules`** — the session must fit inside a weekly window,
   evaluated in *the rule's own* timezone. Each rule carries its own `timezone`
   column, and the request is a UTC instant. `_shared/time.ts` projects the
   instant onto the rule's wall clock with `Intl.DateTimeFormat`; a naive UTC
   comparison books people an hour out for half the year and produces
   impossible slots on DST boundaries.
2. **`availability_blocks`** — no overlap with the busy window.
3. **Other bookings** — no overlap with any `requested` / `confirmed` /
   `completed` booking for that provider, widened by `services.buffer_minutes`
   on both sides.
4. **The seeker's own calendar** — you cannot book two things at once.

Also checked: the service is active, it is not the caller's own, the provider's
`accepts_bookings` / `is_out_of_office` flags, and the same Apple IAP guard as
checkout.

`cancellation_window_hours` is **snapshotted** from the service onto the
booking. Policy §2.3 says terms not shown before payment are not binding, so the
terms in force at booking time are the ones that stick — a later edit to the
service cannot reach backwards.

Status is `confirmed` when `services.requires_approval` is false, `requested`
when it is true. Payment is taken either way; see "Things I was unsure about".

**Notable error codes:** `service_inactive`, `slot_in_the_past`,
`provider_not_accepting`, `provider_out_of_office`, `no_availability_published`,
`outside_availability`, `slot_blocked`, `slot_taken`, `already_booked`.

`outside_availability` returns the provider's rules in `details` so the client
can rebuild its picker; `slot_blocked` deliberately does **not** return the
block's `reason` — that is the provider's private calendar, which is exactly why
`0006_rls.sql` restricts the table to them.

### Overlap with `0008_functions.sql`

`0008` added `available_slots(provider, service, from_date, to_date)`, a
`security definer` RPC that computes free slots from the same three tables. That
is the right thing for the **client's slot picker** to call — it can read past
the RLS restriction on `availability_blocks` without leaking the block reason,
which a direct client query cannot.

`book-service` still re-derives the answer itself rather than calling it, and
should keep doing so: the picker is a hint, the booking is the decision, and a
slot can go stale between the two. But the two implementations now have to agree
about edge cases — buffers, sessions crossing local midnight, DST transitions.
If `available_slots` offers a slot this function then rejects, that divergence
is the bug, and it is worth a shared test fixture over both.

---

## `request-refund`

Opens a `refund_requests` row against an order **or** a booking.

**Auth:** signed-in user (the buyer/seeker, or an admin).
**Method:** `POST`

```jsonc
{
  "order_id": "…",              // exactly one of order_id / booking_id
  "booking_id": null,
  "reason": "The practitioner didn't show up."
}
```

### The store rail rule

If `rail` is `apple_iap` or `google_play`, **no row is created**. Apple and
Google are the merchant of record; MSN never received the money and cannot
refund it. Creating a request would produce a ticket nobody can action and a
customer waiting three business days to be told "go and ask Apple".

**409**

```jsonc
{
  "created": false,
  "refundable_by": "apple",
  "rail": "apple_iap",
  "message": "Apple processed this payment, so Apple has to issue the refund. MSN cannot refund it.",
  "instructions": "Apple is the merchant for this purchase and only Apple can refund it. Open reportaproblem.apple.com, sign in with the Apple Account used to buy, and choose Request a refund.",
  "url": "https://reportaproblem.apple.com",
  "amount": { "total_cents": 9900, "currency": "USD", "display": "$99.00" },
  "subject": "order A1B2C3D4E5"
}
```

Render `instructions` and link `url`. This is the gap Appendix A4 of the refund
policy flags as needed before launch.

### Otherwise

**201**

```jsonc
{
  "created": true,
  "refund_request_id": "…",
  "status": "requested",
  "rail": "stripe",
  "amount": { "claimed_cents": 9900, "currency": "USD", "display": "$99.00" },
  "remedy_note": "Any refund due is returned to your original payment method.",
  "acknowledged_at": "2026-08-12T10:00:00Z",
  "decision_due": "within 3 business days",
  "context": {
    "kind": "booking",
    "cancellation_window_hours": 24,
    "hours_until_start": 6.5,
    "within_cancellation_window": false,
    "provider_cancelled": false
  }
}
```

`context` is computed so the reviewing admin does not have to go and look it up:
whether the host cancelled the event (§6.1 → automatic full refund), whether the
provider cancelled the booking (§3.1 → same), and whether the request falls
inside the **snapshotted** cancellation window.

`acknowledged_at` is stamped at creation. Policy §4.2 promises acknowledgement
within one business day; the app acknowledges immediately, so there is no reason
to leave a clock running against a promise already kept.

Duplicate open requests are refused with `refund_already_open` and the existing
request's id.

---

## `process-refund`

**Auth:** platform administrator only (`profiles.is_admin`).
**Method:** `POST`

```jsonc
{
  "refund_request_id": "…",
  "decision": "approve",                 // approve | decline
  "amount_cents": 9900,                  // approve only, defaults to the claimed amount
  "cause": "provider",                   // platform | provider | customer | force_majeure | unknown
  "decision_note": "…",                  // REQUIRED on decline (§4.3)
  "cancel_booking": "provider"           // optional, bookings only
}
```

### Refunds are cash

**§7.2 — where the failure is ours, the remedy is money.** Every approved refund
returns cash to the original payment method, so there is no alternative remedy
to refuse and no guard to enforce: the rule is satisfied structurally.

`cause` is still accepted and still recorded — it rides along on the Stripe
refund's metadata and belongs in an audit trail — but it no longer gates
anything.

### Approve

Calls `stripe.refunds.create` with idempotency key
`refund:<id>:<amount_cents>` — a retry of the same decision can never refund
twice, while a *different* amount is correctly treated as a different decision.
Then sets `orders.status` to `refunded` or `partially_refunded`.

`rail` can only be `stripe` at that point: `apple_iap` and `google_play` are
rejected earlier with `store_rail_not_refundable_by_msn`, and the enum has no
other member. The function still checks, as a tripwire in case that changes.

### Decline

Sets `declined`, `decided_at`, `decided_by`, and stores `decision_note`, which
is shown to the customer verbatim. §4.3 requires the reason in writing, so the
note is mandatory and the request is rejected without it.

**200**

```jsonc
{
  "refund_request_id": "…",
  "status": "processed",
  "cause": "provider",
  "amount_cents": 9900,
  "amount_display": "$99.00",
  "partial": false,
  "stripe_refund_id": "re_…",
  "processed_at": "2026-08-12T10:05:00Z"
}
```

---

## `send-push`

**Auth:** a signed-in **admin**, or a caller presenting the service-role key.
Ordinary users cannot call it — an open push endpoint is a spam cannon.
**Method:** `POST`

```jsonc
{
  "profile_ids": ["…"],                     // or "profile_id", or "audience"
  "audience": "event_attendees:<event-id>", // or "followers_of:<profile-id>"
  "kind": "event_reminder",
  "title": "Starts in an hour",
  "body": "Sound Bath at Union Chapel.",
  "deep_link": "msn://event/…",             // or "path": "event/…"
  "payload": { "event_id": "…" },
  "dedupe_key": "event_reminder:<event-id>",
  "push": true
}
```

**200**

```jsonc
{
  "kind": "event_reminder",
  "requested": 120, "notified": 118, "created": 118,
  "skipped_duplicates": 0, "suppressed_suspended": 2,
  "pushed": 96, "push_failed": 4, "stale_tokens_removed": 4,
  "errors": ["ios token rejected: DeviceNotRegistered"]
}
```

Behaviour worth knowing:

- The `notifications` row is the durable record — the app reads it over
  Realtime, and it is what the bell icon renders. The push is best-effort on
  top. Expo being down never fails the call; the failures come back in
  `errors`.
- `dedupe_key` makes the call idempotent: a second run with the same key
  inserts nothing and, if nothing new was created, pushes nothing. This is how a
  reminder cron can retry without buzzing everyone twice.
- Suspended profiles are dropped.
- Tokens Expo reports as `DeviceNotRegistered` are deleted. Nothing else prunes
  `push_tokens`.
- Cap is 2000 recipients per call; page beyond that.

Other functions do **not** call this over HTTP — they use
`_shared/notify.ts` directly, which is the same code without the extra hop.

---

## Schema gaps found while building this

None of these are blocking; all of them are worth a migration `0007`.

1. **No webhook event log.** There is no `stripe_events` table to record
   processed event ids, so idempotency is derived from order state instead (see
   above). It works, but a `stripe_events(id primary key, type, received_at)`
   table would make redelivery a one-line check and give an audit trail of what
   Stripe actually sent.

2. **No atomic increment for `ticket_types.quantity_sold`.** There is no RPC, so
   `_shared/inventory.ts` does an optimistic compare-and-swap with bounded
   retries. Correct, but a `create function increment_quantity_sold(uuid, int)`
   doing `update … set quantity_sold = quantity_sold + n … returning` would be
   one statement and one round-trip instead of two-plus.

3. **Pending orders do not hold inventory.** `quantity_sold` only moves at
   fulfilment, so N buyers can all pass the availability check and one of them
   loses after paying. When that happens the function clamps `quantity_sold` to
   `quantity` (the `ticket_not_oversold` constraint would reject anything
   higher), still issues the tickets — the money is already taken, refusing
   helps nobody — and fires an `event_oversold` notification to the host. A
   proper fix is a hold: either a `reserved_until` column, or counting
   `pending` orders created in the last N minutes against availability.

4. **No per-attendee data on `order_items`.** `tickets` has `attendee_name` and
   `attendee_email`, but there is nowhere to carry them from checkout through to
   the webhook that issues the tickets. Every ticket is currently issued with
   `holder_id = buyer_id` and the buyer's name. An `order_items.attendees jsonb`
   column, or an `order_attendees` table, would close it. Until then the app
   needs a "assign this ticket to someone" screen post-purchase.

5. **`payment_rail` has no `free` member,** and the column is `NOT NULL`. A
   zero-cost order is written with `rail = 'stripe'` and no PaymentIntent, which
   reads as slightly untrue in the data. A `'free'` enum member would fix it.

6. **`booking_status` has no failed/expired state.** When a booking's payment
   fails the webhook sets `cancelled_by_seeker`, which is the closest available
   value but is not what happened — the seeker did not cancel anything. A
   `'payment_failed'` or `'expired'` member would let reporting tell an
   abandoned checkout apart from a real cancellation.

7. **No booking overlap constraint.** Conflict detection is application-level,
   so two simultaneous requests for the same slot can both pass. With
   `btree_gist`, an exclusion constraint would make it impossible:

   ```sql
   create extension if not exists btree_gist;
   alter table bookings add constraint bookings_no_overlap
     exclude using gist (
       provider_id with =,
       tstzrange(starts_at, ends_at) with &&
     ) where (status in ('requested','confirmed','completed'));
   ```

   The buffer would still need handling in the function, since it comes from the
   service rather than the booking.

8. **Platform fee and tax rates live nowhere.** No settings table, and no
   jurisdiction data on orders. Both are environment variables here.
   `PLATFORM_FEE_BPS` is fine as a secret; `TAX_BPS` is a placeholder that
   should not survive contact with a jurisdiction that actually taxes these
   offerings — that wants Stripe Tax or a rates table keyed on the event's
   address.

9. **`refund_requests` does not record the `cause`.** `process-refund` accepts
   `platform` / `provider` / `customer` / `force_majeure` / `unknown` and writes
   it onto the Stripe refund's metadata, but nothing in the database keeps it.
   Who was at fault is the input to several policy clauses (§3, §6, §7) and to
   any "how often is it us?" question, so it should be a column and not a field
   on a third party's object.

10. **`refund_requests` has no `rail` column.** Derivable by joining, but it
    means the "who can refund this" question needs a join every time, including
    in any admin list view.

---

## Things I was unsure about

- **Approval-required bookings are charged up front.** `book-service` creates an
  ordinary auto-capturing PaymentIntent even when
  `services.requires_approval` is true, so a seeker pays before the practitioner
  accepts, and a decline has to become a refund. The alternative —
  `capture_method: 'manual'` — is a better fit for the flow but needs a capture
  step in the approve path and an expiry sweep for uncaptured authorisations
  (Stripe drops them after 7 days), neither of which is in scope here. Flagging
  it rather than half-building it.

- **Refunds do not void tickets.** `tickets.is_void` exists and nothing sets it.
  A full refund arguably should void them; a partial refund clearly should not
  void all of them, and there is no way to tell which ones the partial covered.
  Left alone deliberately — a wrong `is_void` at the door is worse than a stale
  one in a report.

- **Bookings have no `subtotal_cents`.** Unlike `orders`, `bookings` carries only
  `total_cents` and `platform_fee_cents`. I read `total_cents` as gross (what the
  seeker pays, fee included) and record the fee alongside it. If the intent was
  net-of-fee, `book-service` and `process-refund` both need adjusting.

- **`event_attendees` in `send-push` resolves via `tickets.holder_id`,** which
  is nullable. Tickets not yet assigned to a profile are silently skipped. Fine
  today because fulfilment always sets a holder; it stops being fine the moment
  gap 4 is closed and tickets get reassigned to non-users.

- **Tax is charged on the subtotal, not on the platform fee.** Whether the fee
  is itself taxable depends on jurisdiction and on whether MSN is the merchant
  of record — which Appendix A2 of the refund policy records as still
  unanswered. `TAX_BPS` defaults to 0 so nothing is quietly wrong in the
  meantime.

---

## Local development

```bash
supabase start
supabase functions serve --env-file ./supabase/.env.local
```

`.env.local` (never commit it):

```
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PUBLISHABLE_KEY=pk_test_…
PLATFORM_FEE_BPS=1000
TAX_BPS=0
APP_DEEP_LINK_SCHEME=msn
DEBUG_ERRORS=true
```

Forward Stripe events to the local runtime:

```bash
stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
stripe trigger payment_intent.succeeded
```

The `whsec_…` that `stripe listen` prints is different from the dashboard
endpoint's secret. Use the printed one locally.

To prove idempotency, resend the same event twice from the Stripe CLI and check
that `tickets` and `ticket_types.quantity_sold` are unchanged by the second
delivery.
