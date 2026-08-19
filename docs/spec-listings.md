# Spec — Listings

**Status:** approved 13 Aug 2026. §4 built in full and verified on the
simulator.
**Author:** drafted 13 Aug 2026
**Decision owner:** Product

---

## 1. The problem

A practitioner's tools are three separate rows under Profile:

| Today | What it is |
|---|---|
| My services | Ongoing sessions people book |
| My events | Things on a fixed date with tickets |
| Availability | The weekly hours sessions get booked into |

Three problems with that:

**Availability is a sibling of the things it belongs to.** It only affects
services. For a host who only runs events it is a top-level menu item that does
nothing. The screen already has to explain itself — it currently tells you
*"Both numbers live on the service, not here"*, because duration and buffer are
set per service while the hours are not. A screen apologising for its own scope
is a sign it is in the wrong place.

**There is no single answer to "what am I offering?"** A practitioner who runs
both sessions and a retreat has to check two lists.

**We are one step from needing a host type we do not want.** The old web app
solved this with `isHealer()` — a flag on the person deciding whether they see
booking tools. That flag is a fork in every screen forever.

## 2. What the evidence says

Three independent sources point the same way.

**The old web app already grouped these.** Its organiser sidebar has one
top-level destination, "Manage content", covering exactly three things:
sessions (`HealerAppointmentTypesController`), schedule
(`AppointmentScheduleController`) and events (`HealerEventsController`).
Our three rows are that destination, split back apart.
See `routes/frontend.php:321–324` in `mysourcenetwork-events`.

**Airbnb splits by listing type, not host type.** Their two bookable things
work like ours:

| | Airbnb Service | Airbnb Experience |
|---|---|---|
| Booked by | Any slot inside recurring weekly hours | A specific scheduled instance |
| Host sets | Business hours (15-min increments), booking window, advance notice, prep buffer | Date, time, price, group size, repeat daily/weekly |

Both sit under **one Listings tab**. There is no "service host" or "experience
host" — there is a host, and what varies is what they listed.

**Our schema already matches.** `services` has `duration_minutes` and
`buffer_minutes`; `events` has `starts_at`, `capacity`, `ticket_types`, and
`event_occurrences` for repeats. We have Airbnb's two shapes already. We just
present them as two unrelated menu items.

## 3. The model

> The umbrella is the **listing**, not the practitioner.

One destination, **Listings**, holding two kinds:

- **Session** — ongoing, booked into your hours. (`services`)
- **Event** — a set date, ticketed, optionally repeating. (`events`)

A practitioner is never classified. Someone who only runs events simply has no
session listings, so hours never appear for them. Someone who does both sees
both. `isHealer()` never gets built.

## 4. What changes

### 4.1 Navigation

`My services`, `My events` and `Availability` are replaced by one row,
**Listings**.

If the Practice tab lands (separate decision — see §7), Listings is its main
content rather than a row under Profile.

### 4.2 The Listings screen

One list, both kinds, most recently updated first. Each row shows its type, its
title, and its state.

State labels differ per kind today and should keep differing, because they mean
different things:

- Session — **Bookable** / **Off** (`services.is_active`)
- Event — **Draft** / **Published** / **Cancelled** (`events.status`)

Do not unify these into one vocabulary. "Draft" for a session would imply a
publish step that does not exist.

### 4.3 Creating a listing

"New listing" asks one question before anything else:

> **What are you offering?**
> - *Sessions people book with you* — you set the hours, they pick a time
> - *An event on a set date* — you set the date, they buy a ticket

That answer routes to the existing create flows unchanged.

### 4.4 Availability moves inside

Availability stops being a top-level destination. Its content appears as the
scheduling section **inside a session listing**.

It must be labelled honestly, because the hours are shared:

> **Your booking hours**
> These hours apply to every session you offer. This one is 60 minutes with a
> 15-minute buffer, so people can start every 1h 15m inside them.

The "What a seeker sees" slot preview stays — it is the strongest part of the
current screen and it belongs next to the listing it describes.

Accepting-bookings and out-of-office are **practitioner-level**, not listing
level. They move to Profile → Account, near the other things that describe the
person rather than a listing.

## 5. What does NOT change

Scope discipline. This is a **presentation change**.

- **No table merge.** `services` and `events` stay separate. Their shapes are
  genuinely different — events carry venue, ticket types, occurrences and a
  publish lifecycle; services carry duration, buffer and a cancellation window.
  Merging them buys nothing and costs a migration of every booking path.
- **No change to `availability_rules`.** Hours stay per practitioner
  (`availability_rules.provider_id`, `0003_catalog.sql:218`). Showing them
  inside a listing is a UI move, not a schema move.
- **No change to booking, checkout, refunds or check-in.**
- **No new permissions.** Mode remains presentation-only.

## 6. Known limitation, accepted for now

Airbnb's availability is **per listing**. Ours is **per practitioner**.

A practitioner who wants Mondays for massage and Thursdays for breathwork
cannot express that. The wording in §4.4 tells the truth about it rather than
hiding it.

Going per-listing means `availability_rules` gains a nullable `service_id`
(null = applies to all), plus a change to `available_slots`. That is a real
piece of work and should wait until a practitioner actually asks. Building it
first would be guessing.

## 7. Decisions — settled 13 Aug 2026

1. **Listings is a TAB, replacing Discover while hosting.**
   Overrules the recommendation in the draft, which was to start as a row
   under Profile. Discover is the tab that is actively wrong while you are
   working, so it is the one that gives up its place. Bookings, Messages and
   Profile are correct in both modes and stay.

   Note the scope precisely: Discover is hidden **in hosting mode**, not for
   practitioners generally. A practitioner in seeking mode browses like anyone
   else — that is the entire point of the binary mode.

2. **One profile, binary mode. Confirmed.**
   The old app's N-profiles-per-email model is not being carried over. The
   two-row mode switcher is therefore the right shape, and the question of
   multi-profile providers is closed for now.

   If that turns out to be wrong in production — a practitioner who genuinely
   needs a personal and an organisation identity — the switcher sheet is the
   thing that changes, not this spec.

3. **The word is "Listings".**

## 8. Out of scope

- Payments and payouts
- Per-listing availability (§6)
- Splitting Messages by mode — neither the old app nor ours does this, and
  volume does not justify it yet
- Any change to what a seeker sees

## 9. Open risk

The practitioner tools have not been used in anger by a real practitioner. This
spec reorganises them based on the old app's structure, Airbnb's model and the
schema — not on watching someone use them. If there is any chance of putting
this in front of one practitioner before build, that is worth more than
everything above.

## 10. Build state

**Done and verified on the simulator** — as Maya, who has two sessions and one
draft event:

- Listings tab replaces Discover in hosting mode (`(tabs)/_layout.tsx`,
  via `href: null`)
- One list, both kinds, ordered by `updated_at` (`(tabs)/listings.tsx`)
- Count line — "2 sessions · 1 event"
- "New listing" → the kind chooser (`provider-tools/NewListingSheet.tsx`)
- Empty state naming both kinds
- Switching mode while standing on the tab that is about to be hidden now
  redirects instead of stranding you on a screen with no active tab

**§4.4 — availability moved, and the Availability screen is gone:**

- `SlotPreviewSection`, `WeeklyHoursSection` and `TimeOffSection` now render
  inside `(provider)/services/[id]`, under a "Your booking hours" heading that
  states outright that the hours are shared across every session.
- `BookingStatusSection` (accepting bookings, out of office) moved to
  `(tabs)/profile`. It describes the practitioner, not a listing — leaving it
  inside one service would have implied switching it off affected only that
  service.
- `(provider)/availability.tsx` deleted and unregistered. Nothing linked to it,
  and it is not one of the `msn://` deep links.
- `SlotPreviewSection` gained `pinnedServiceId`. Inside a service editor the
  service picker was noise and could silently preview a different service than
  the one being edited; pinned, the chips are dropped and the copy changes —
  "Both numbers live on the service, not here" became false the moment the card
  moved onto the service.

**Bookings follows mode outright (added after this spec was approved):**

The seeker/provider segmented control is gone. Hosting shows "Booked with me",
seeking shows "Booked by me", and the h2 carries the answer — it used to read
"Bookings", duplicating the nav bar directly above it.

Two controls for one piece of state was the problem, and the less prominent one
changed the whole app. It could go because mode is now unmistakable without it:
a ringed avatar in the tab bar, purple hosting and green seeking, and Listings
in place of Discover.

**Still not done:**

- The two row types have noticeably different visual weight in one list — a
  session row carries a switch and is roughly twice the height of an event row.
  It reads fine but is not harmonious. Left alone deliberately: both components
  are already used elsewhere, and unifying them is a design pass, not a bug fix.

---

## Sources

- `mysourcenetwork-events` — `resources/views/frontend/dashboard/sidebar.blade.php`,
  `routes/frontend.php:321–324`, `app/Models/User.php:303` (`isHealer`)
- `msn-app/supabase/migrations/0003_catalog.sql` — `services`, `events`,
  `event_occurrences`, `availability_rules`
- [Manage availability for your service listing — Airbnb](https://www.airbnb.com/help/article/3949)
- [Manage experiences from your host calendar — Airbnb](https://www.airbnb.com/help/article/2645)
- [Exploring your hosting tools — Airbnb](https://www.airbnb.com/resources/hosting-homes/a/exploring-your-hosting-tools-738)
