# My Source Network — native app

A React Native rebuild of the MSN marketplace, on a new Supabase backend.

This is a **separate product from the Laravel web app**. It does not share a
database, an API, or a deployment with it. The web app at
`Menzies-Mission/mysourcenetwork-events` is untouched and keeps running exactly
as it does today. If the two are ever to share data, that is a migration nobody
has designed yet — see [Where this does NOT connect](#where-this-does-not-connect).

---

## Contents

- [Getting it running](#getting-it-running)
- [The shape of the thing](#the-shape-of-the-thing)
- [Backend](#backend)
- [App](#app) — including [Mode](#mode--seeking-or-hosting) and [Listings](#listings)
- [The rules that matter](#the-rules-that-matter)
- [Testing accounts](#testing-accounts)
- [What is deliberately unfinished](#what-is-deliberately-unfinished)
- [What is deliberately unfinished](#what-is-deliberately-unfinished)
- [Where this does NOT connect](#where-this-does-not-connect)

---

## Getting it running

You need Xcode with an iOS simulator, Node 20+, and CocoaPods.

```bash
cd app
npm install
npx expo prebuild --platform ios   # regenerates ios/ — see the warning below
cd ios && pod install && cd ..
npx expo run:ios
```

**`expo prebuild` deletes and regenerates `ios/`.** Anything hand-edited in
there is lost, including the CocoaPods workspace — which is why `pod install`
has to follow it, and why a build straight after a prebuild fails with
*"MySourceNetwork.xcworkspace does not exist"*. Do not edit `ios/` directly;
change `app.config.ts` and prebuild again.

There is one patched dependency (`patches/expo-modules-jsi+57.0.4.patch`) which
`postinstall` reapplies. It fixes an ambiguous `abs()` overload that stops the
build under Swift 6.2 / Xcode 26. Prebuild wipes it; `npx patch-package` puts
it back.

Environment lives in `app/.env` — Supabase URL and anon key, both public by
design. Nothing secret belongs there; the bundle is readable by anyone who
downloads the app.

---

## The shape of the thing

```
msn-app/
├── app/                  Expo / React Native client
│   ├── src/app/          Routes. expo-router: the file tree IS the navigation
│   ├── src/components/   UI, grouped by area not by type
│   ├── src/lib/queries/  Every database call. Screens never call supabase directly
│   ├── src/context/      AuthContext — the session, and only the session
│   └── src/theme/        Design tokens extracted from the web app's SCSS
└── supabase/
    ├── migrations/       27 files, applied in order, never edited once applied
    ├── functions/        6 Edge Functions — anything that must not be trusted to a client
    └── seed/             Demo content
```

**The one structural rule:** a screen never talks to Supabase. It calls a
function in `src/lib/queries/`, which owns the shape of the request and the
error message. This is why a filter can be fixed in one place instead of six,
and why an error can say "load your bookings" rather than surfacing a Postgres
code.

---

## Backend

Supabase: Postgres 17, row-level security, Realtime, Storage, Auth, plus Edge
Functions in Deno.

### Migrations

27 files in `supabase/migrations/`, applied in filename order.

```bash
export SUPABASE_DB_PASSWORD="$(cat .supabase-db-password)"
npx supabase db push
```

They are **append-only**. Once a migration has run against the shared database,
editing it means the file no longer describes what actually happened — fix
forward with a new one.

Roughly:

| Range | What it does |
|---|---|
| 0001–0009 | Schema: identity, catalogue, commerce, social, RLS, storage, functions, seed |
| 0010–0019 | Correctness: booking overlap, idempotency, transition guards, RLS recursion |
| 0020–0027 | Features: report outcomes, host search, account deletion, admin money |

Four of them (`0021`, `0022`, `0024`, `0027`) touch **demo data only** and are
scoped to reserved `.test` domains or seeded rows. They must not run against
production. `0024` and `0027` set a known password on demo accounts.

### Security is in the database, not the app

Every table has RLS. The app's guards are convenience — a user who bypassed the
UI entirely would still be refused by Postgres. If you are ever tempted to
"just check it in the client", the answer is a policy.

Two patterns worth knowing:

- **`security definer` helpers.** `auth_is_admin()`, `auth_in_conversation()`.
  A policy that queries its own table recurses (`42P17`) — a helper that reads
  past RLS breaks the cycle. This was a real outage: messaging was 100% dead
  until `0015`.
- **`security definer` functions gate themselves.** They read past RLS, so the
  `auth_is_admin()` check lives *inside the query body*. See
  `admin_money_summary` — a non-admin gets an empty result, not an error.

### Edge Functions

Six, in `supabase/functions/`. Anything a client must not be trusted with:

| Function | Job |
|---|---|
| `create-checkout` | Event tickets. Owns price, idempotency, sale-window checks |
| `book-service` | One-to-one sessions. Maps overlap violations to a usable 409 |
| `request-refund` | A seeker asks |
| `process-refund` | An admin decides |
| `stripe-webhook` | Fulfilment on payment |
| `send-push` | Notification delivery (**never exercised** — see below) |

Deploy: `npx supabase functions deploy <name>`.

### Storage

Five buckets (`0007`): `avatars`, `covers`, `event-images`, `galleries`,
`message-attachments`. Policies key off the **first path segment being the
owner's id** — `<profileId>/<file>`. A file anywhere else is refused.

Uploading from React Native has one trap: `fetch(uri).then(r => r.blob())`
produces **zero-byte files on Hermes**. The Blob wraps a native handle, not
bytes. `src/lib/queries/uploads.ts` reads into an `ArrayBuffer` first, and must
keep doing so.

---

## App

Expo SDK 57, React Native 0.86, expo-router, React Query, TypeScript strict.

### Routing

File-based. `src/app/(tabs)/index.tsx` is Discover. Groups in parentheses do
not appear in the URL.

`src/app/index.tsx` exists for one reason: without a `/` route, expo-router
falls through to the first directory **alphabetically**, which is `(auth)`. The
app opened on a login form not because anything redirected there but because it
sorted first.

### Mode — seeking or hosting

`src/context/ModeContext.tsx`. One account, two views of it, copied from
Airbnb's "Switch to hosting". **It is presentation, never permission** — a
seeker forced into hosting mode sees the same empty screens, and RLS still
decides every write. Persisted per profile id in SecureStore, so a shared
device does not inherit the last person's mode.

Mode changes three things and nothing else:

| Surface | Seeking | Hosting |
|---|---|---|
| First tab | Discover | **Listings** |
| Bookings | "Booked by me" | "Booked with me" |
| Profile tab avatar | green ring | purple ring |

The tab swap uses `href: null` in `(tabs)/_layout.tsx`, which removes a tab
from the bar **without unregistering the route** — so existing links to
Discover still resolve while hosting. Switching mode while standing on the tab
that is about to be hidden redirects you off it; without that you are left on a
live screen with no matching tab and nothing highlighted, which looks broken
even though nothing errored.

The switcher itself is a **long press on the Profile tab**, with a coach mark
that appears up to three times and retires the moment the gesture is used.
Airbnb hides the same gesture and their help centre is full of people asking
where the toggle went; the coach mark is the answer to that. A long press can
never be the only route, so Profile keeps a visible "Switch to hosting" button.

### Listings

Services and events are one destination, not two menu items. The umbrella is
the **listing**, not the practitioner — see `docs/spec-listings.md` for the
reasoning and the evidence behind it. Consequences worth knowing:

- There is **no Availability screen**. Booking hours, time off and the slot
  preview render inside `(provider)/services/[id]`; accepting-bookings and
  out-of-office moved to Profile, because they describe the person.
- `availability_rules` is still keyed on `provider_id`, so hours are shared
  across every service. The heading inside a service says so outright —
  without that sentence it implies a per-service edit.
- `SlotPreviewSection` takes `pinnedServiceId` when rendered inside a service,
  which drops its service picker. Unpinned it would happily preview a
  different service than the one being edited.

### Auth

**Browsing does not require an account.** Discover, and the event, service and
practitioner pages behind it, work signed out. Bookings, Messages and Profile
render a signed-out state (`components/auth/SignedOut.tsx`). Every action that
*writes* — Book, Message, Follow, Report — sends you to sign in and brings you
back to where you were (`signInThen`, and the `redirect` param honoured in
`src/app/_layout.tsx`).

The `redirect` param is validated by `isSafeRedirect` before it is followed.
The app registers a `msn://` scheme, so that value can come from outside; only
plain in-app paths are allowed.

### Types

`src/types/database.ts` is **generated**:

```bash
npx supabase gen types typescript --linked > src/types/database.ts
```

Hand-writing it caused 35 compile errors that all manifested as
`parameter of type 'never'`. Never edit it by hand — with one exception
currently present and clearly marked: three function signatures were added
manually because the CLI's platform token expired mid-session. Re-run the
generator after `supabase login` and the block is replaced.

### Realtime

One rule, learned the hard way: tear channels down with **`removeChannel`**, not
`unsubscribe()`. The latter closes a channel but leaves it registered, so the
next `supabase.channel(topic)` hands back the dead one and attaching a listener
throws `cannot add postgres_changes callbacks ... after subscribe()`. That was a
red screen on sign-out → sign-in.

### Design tokens

`src/theme/extracted-tokens.ts` — colours, type scale and spacing lifted from
the web app's SCSS so the two products look like the same company. Light and
dark are both defined. Do not hardcode a hex in a component.

---

## The rules that matter

Things that will bite you if you do not know them:

1. **One event status, not three booleans.** The old app had `is_published`,
   `is_draft` and `is_cancelled` as separate flags, which could all be true.
   `events.status` is a single enum. Keep it that way.
2. **Bookings cannot overlap.** A GiST exclusion constraint (`0010`) enforces it
   in the database. A `23P01` means a double-book was attempted; map it to a 409
   and tell the person to pick another time.
3. **Checkout is idempotent.** Two concurrent checkouts once produced two paid
   orders and four tickets. `0016` added per-buyer idempotency keys. The replay
   path returns the *existing* order.
4. **Money rows pin their currency.** A listing that has sold cannot be
   repriced — see the guards in `0022`.
5. **Deleting an account is anonymisation.** `orders`, `bookings` and
   `refund_requests` reference profiles with `on delete restrict`, and tax law
   requires those records be kept. The profile is emptied; the rows keep
   pointing at a tombstone.
6. **Trust flags are not user-writable.** `is_verified`, `is_certified`,
   `is_admin` are reverted by a trigger for anyone who is not an admin. A
   control for them in the UI would save cleanly and change nothing.
7. **Never call the database from inside a Supabase auth callback.**
   supabase-js holds an internal lock for the duration of
   `onAuthStateChange`, and `getSession()` holds it too — that call does not
   merely read, it *refreshes an expired token*. Every PostgREST request needs
   the same lock to attach its auth header, so a `.from()` issued from inside
   either one waits on a lock its own caller is holding. It does not fail
   loudly: it stalls, then surfaces as a fetch error, which `toAppError` maps
   to **"No connection."**

   That was two separate ghosts — a false "No connection" on a first sign-in
   with correct credentials, and a profile stuck on "Could not load your
   profile" after the app had idled long enough for the token to expire. Both
   were timing-dependent, which is why they read as flaky rather than broken.
   `AuthContext` now defers both call sites by one tick (`setTimeout(…, 0)`),
   which is enough to let the lock go. Keep it that way.

---

## Testing accounts

Demo accounts use RFC 2606 reserved `.test` domains, which can never receive
mail.

```
maya@demo.mysourcenetwork.test    practitioner    demo-password-1234
tomas@demo.mysourcenetwork.test   practitioner    demo-password-1234
demo@msn.test                     admin           demo-password-1234
```

**Do not send email from this project.** Sign-up through the app triggers a
confirmation email; `mailer_autoconfirm` is off. Create test accounts
server-side with the email pre-confirmed instead.

---

## What is deliberately unfinished

Documented rather than hidden, because each one looks finished from the outside:

| Gap | Reality |
|---|---|
| **Payments** | Bypassed. `payment_bypassed` marks orders paid without money moving. The admin money screen reports those separately and never adds them to a real total. Needs `STRIPE_SECRET_KEY`. |
| **Payouts** | Not built. Needs Stripe Connect onboarding. Practitioners cannot be paid. |
| **Account deletion finalisation** | `finalise_account_deletion` exists and **nothing schedules it**. Requests sit dark and recoverable for ever. The erasure promise is not kept until a daily job runs it. |
| **Push** | Neither half works. Nothing registers a device; `send-push` has never been exercised. In-app notifications are unaffected. |
| **Apple IAP** | One-to-many live online events need Apple's billing (guideline 3.1.3(d)). One-to-one online sessions may use Stripe. The payment rails exist in the data model; nothing implements them. |
| **Reviews** | Readable, not writable. There is no screen to leave one. |
| **Sign-up round trip** | Code complete, never run — email sending was off limits during the build. |
| **Android** | Never built or run. |
| **Photo upload** | `expo-image-picker` is wired and the permission copy is right, but the upload round trip has never been completed — the picker has only ever been opened and closed. Buckets exist (`avatars`, `covers`, `event-images`, `galleries`). Treat as unverified. |
| **Door check-in** | The scanner screen is real and wired: `(provider)/check-in/[id]` uses `expo-camera` and the `check_in_ticket` RPC, reached from a "Scan tickets" button that only appears once an event has attendees. Never run against a real ticket. |
| **Per-listing availability** | Airbnb's hours are per listing; ours are per practitioner. A practitioner cannot offer massage on Mondays and breathwork on Thursdays. Deliberate — see `docs/spec-listings.md` §6. |

### One inconsistency worth fixing

There are **two check-in paths**, and only one is guarded. The scanner goes
through the `check_in_ticket` RPC, which refuses void tickets and preserves the
original arrival time when a ticket is scanned twice. Tapping a name in the
attendee list instead does a raw `UPDATE` with none of those guards
(`lib/queries/orders.ts`). The UI hides that button for void and already-arrived
tickets, so it is not reachable in normal use — but two people working one door
on two phones can race it, and the loser overwrites an arrival time. Point the
manual path at the same RPC.

---

## Where this does NOT connect

- **The Laravel web app.** No shared database, no API calls in either
  direction. Data created here is invisible there and vice versa.
- **Production Stripe.** No live keys anywhere in this project.
- **Any live email domain.** By design.

Two things follow. Anything demoed from this app is demo data, not the real
marketplace. And migrations `0021`, `0022`, `0024` and `0027` exist to make that
demo data usable — they must be removed before these migrations are ever
pointed at a production database.
