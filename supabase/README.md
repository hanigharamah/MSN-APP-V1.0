# MSN — Supabase backend

Fresh Supabase project for the React Native app. Not a port of the Laravel
schema (177 tables) — this is the subset the app actually needs, modelled
cleanly.

## Running the migrations

**Option A — dashboard (no tooling needed)**

Open your project → SQL Editor → paste each file in order and run:

```
0001_init.sql        extensions, enums, helper functions
0002_identity.sql    profiles, provider details, push tokens
0003_catalog.sql     categories, events, ticket types, services, availability
0004_commerce.sql    orders, tickets, bookings, refunds
0005_social.sql      follows, saves, reviews, messaging, notifications
0006_rls.sql         row level security — run this before 0007
0007_storage.sql     storage buckets and object policies
0008_functions.sql   available_slots, search, unread counts, search indexes
0009_seed.sql        the category tree
0010_booking_overlap.sql        exclusion constraints against double-booking
0011_remove_tokens.sql          drops the (unapproved) token system
0012_search_price_and_preview.sql  min_price_cents + conversation previews
```

Storage paths and the RPC signatures are documented in
[STORAGE_AND_FUNCTIONS.md](STORAGE_AND_FUNCTIONS.md). Development-only demo
content is in `seed/demo_data.sql` and is not applied by `db push`.

**Option B — CLI**

```bash
brew install supabase/tap/supabase
supabase link --project-ref <your-ref>
supabase db push
```

## Design decisions worth knowing

**One status column per concept.** `events.status` is a single enum
(`draft / published / cancelled / completed / archived`). The Laravel app
carries three overlapping columns — `status`, `event_status`, `is_draft` — and
computes display state by OR-ing all three. That is the root cause of its
"status is inconsistent across the platform" defects. Not repeated here.

**Trust flags are database-guaranteed.** A user can update their own profile
but cannot set `is_verified`, `is_certified`, `is_admin`, `is_suspended` or
`account_type`. A `before update` trigger reverts those columns for non-admins.
In the Laravel app `is_verified` sits in `$fillable` with no writer and no
guard — the shape of the self-assign-badge bug. Here it cannot happen
regardless of what any client sends.

**Payment rail is recorded per transaction.** `orders.rail` and
`bookings.rail` are enums (`stripe / apple_iap / google_play`).
Apple and Google purchases can only be refunded by the store, so the app has to
know which rail took the money before it can tell a customer where to go.

**`delivery_mode` drives payment routing.** Apple prohibits IAP for services
consumed outside the app (3.1.3(e)) and requires it for one-to-many realtime
services (3.1.3(d)). `in_person` / `online_live` / `one_to_one` is how the
client decides which rail to open.

**Refunds cover bookings too.** `refund_requests` targets an order *or* a
booking. The Laravel app only has a refund workflow for orders — appointments
have no request object at all, which is why the refund policy's 3-business-day
commitment is currently unimplementable on that side.

**There is no token system.** It was proposed and not approved, so `0011` drops
the tables, the columns and the `tokens` member of `payment_rail`. If it is ever
approved, `0011` is the spec for putting it back — see git history for `0004`.

**Double-booking is impossible at the database.** `0010` adds GiST exclusion
constraints on `bookings` for both provider and seeker, over half-open
`[starts_at, ends_at)` ranges, for the live statuses `book-service` treats as
blocking. Verified: an overlapping insert is rejected with `23P01`, a
back-to-back booking is accepted. The application checks remain — they produce
good error messages; the constraint produces correctness.

**Cancellation windows are snapshotted.** `bookings.cancellation_window_hours`
is copied from the service at booking time, so later edits don't retroactively
change what the seeker agreed to.

## Not included yet

- Push fan-out
- Any link to the Laravel database — that comes later, and should be
  domain-at-a-time rather than a replication of MySQL

## Verifying RLS

After running the migrations, confirm the guard works. As a normal signed-in
user:

```sql
update profiles set is_verified = true where id = auth.uid();
select is_verified from profiles where id = auth.uid();  -- still false
```

The update succeeds but the value does not change. That is the trigger doing
its job.
