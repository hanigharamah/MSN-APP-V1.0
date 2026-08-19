# MSN app — what's built, what isn't

The new React Native app (`msn-app/`) against the existing Laravel web app
(`mysourcenetwork-events/`, read-only reference).

**Last updated:** 18 Aug 2026 · 46 migrations · 33 screens · 6 Edge Functions

> **Keep this current.** Update it in the same change that builds the feature,
> not afterwards — a list that lags is worse than no list, because it gets
> trusted. Move the row, change its status, and update the counts and date in
> the header.

## Status key

| | |
|---|---|
| **Done** | Built *and* verified running — on a device, or proven by a live request. |
| **Code only** | Written and compiles, but never actually run. Treat as unproven. |
| **Partial** | Works in part. The gap is stated. |
| **Not built** | Nothing exists. |
| 🚩 | Blocks an App Store submission. |

Website content management — blog, FAQ, policy pages, banners, email templates,
languages — is **out of scope throughout**. Roughly 30 sections of the old admin
that belong on web, not in a phone app.

---

## Blocking a submission

| Feature | Status | Notes |
|---|---|---|
| 🚩 Real payments — server | **Done** | Stripe test key is set. `create-checkout` returns a real PaymentIntent, the order stays `pending`, and `ALLOW_PAYMENT_BYPASS` has been **removed** so nothing can silently mark orders paid again. Verified: old order `paid/bypassed`, new orders `pending` with real `pi_…` ids. |
| Real payments — card sheet | **Done** | Verified end to end on a device: Stripe sheet opened, `4242` card charged £30.80, webhook marked the order **paid** and issued a real ticket. |
| 🚩 Payouts | **Not built** | Practitioners cannot be paid at all. Needs Stripe Connect onboarding. The secret key is now set, so this is unblocked. |
| 🚩 Apple in-app purchase | **Not built** | Guideline 3.1.3(d) forces IAP on **one-to-many** live online events only. One-to-one online sessions may keep using Stripe. |

Everything else that was blocking is now done — see below.

---

## Seeker

| Feature | Status | Notes |
|---|---|---|
| Browse & search events | **Done** | Works signed out. |
| Browse & search practitioners | **Done** | Works signed out. |
| Filter by category | **Done** | |
| Event / service / practitioner pages | **Done** | All readable signed out. |
| Book a session | **Done** | Real availability; double-booking blocked by the database. |
| Buy event tickets | **Done** | Charged, paid, ticket issued — verified on a device. |
| Bookings & tickets | **Done** | |
| Cancel a booking | **Done** | |
| Request a refund | **Done** | |
| Messaging | **Done** | Live. Starting a conversation was broken until migration 0029. |
| Notifications | **Done** | Header bell on every tab, grouped by subject. |
| Follow a practitioner | **Done** | |
| Write a review | **Done** | |
| Save / wishlist | **Done** | |
| Photo consent | **Partial** | Asked as a card right after booking, per event, three states (yes / no / not answered). Re-raised on every launch and every return to foreground until answered; declining is one tap, same as accepting, and the answer is reversible. Verified end to end on a device: card raised on launch, undismissable, both answers saved, queue advanced, no cross-account leak. One answer covers every ticket held for that event (migration 0040, found in UAT). **The push half is not built** — see Push delivery below. |
| Report a person or listing | **Done** | Guideline 1.2. In the `⋯` menu and at the foot of each listing. |
| Block / unblock | **Done** | Guideline 1.2. Hides the thread; reversible from Settings. |
| Close my account | **Done** | 30-day grace. Refuses while commitments are outstanding, and names them. |
| Browsing without an account | **Done** | Discover and all detail pages. Actions route to sign-in and return you. |
| Edit profile | **Done** | |
| Photo upload | **Code only** | Picker and permission verified on device; the upload round trip has **never been watched complete**. |
| Search near me | **Not built** | Backend takes coordinates and returns distances; nothing asks for location. |
| Reschedule a booking | **Not built** | Cancel only. The old app has request-and-approve both ways. |
| Change email / password in-app | **Not built** | |
| Notification preferences | **Not built** | No per-type control or pause. |
| Push delivery | **Not built** | Nothing registers a device; sending never exercised. In-app notifications are unaffected. **Blocks the push half of photo consent** — the notification row is created by a database trigger and is ready to send, but nothing delivers it. |
| Social login (Apple / Google) | **Not built** | If any social login ships, Sign in with Apple becomes mandatory. |
| Coupons / discount codes | **Not built** | |
| Wallet & top-up | **Not built** | |
| Referrals | **Not built** | |
| Ticket transfer / assign | **Not built** | Cannot buy for someone else. |
| Add to calendar | **Not built** | |
| Reading policy & safety pages in-app | **Not built** | Terms, privacy, community guidelines, crisis support. App Review looks for a privacy link. |

## Practitioner

| Feature | Status | Notes |
|---|---|---|
| My services | **Done** | Create, edit, pause, resume. |
| My events | **Done** | Create, edit, publish, unpublish. |
| Availability | **Done** | Weekly hours plus one-off blocks. |
| Double-booking prevention | **Done** | Enforced in the database, not the interface. |
| Become a practitioner | **Done** | Any seeker can start offering sessions (migration 0028). |
| Hosting / seeking mode | **Done** | Airbnb model. Persisted per profile; every screen follows it. |
| Switch account | **Partial** | One person can hold several accounts — their own profile plus a business, venue, organiser, social-impact or nonprofit they administer (`account_members`, migration 0045). Two ways in: hold the Profile tab icon, or Profile → Switch account. The selection persists per signed-in person. **Not done:** the choice does not yet re-point data access. RLS resolves through `auth.uid()`; moving the hosting policies onto `auth_can_act_as` is a separate change, because it decides who may edit whose listings. |
| Welcome card | **Done** | "Your seekers" — a card of faces over the session page. Tap a face to mark them here; a lit ring shows who has arrived. Each face carries a camera badge for photo consent — green yes, red no, amber not answered — with a line above the grid counting anyone who declined. The same icon appears beside each row on the Attendees tab. The button is always on the page; outside the window it is disabled and says when it opens ("Opens in 8 min" / "Opens Tue 1 Sep, 7:45 PM"). The card itself still only opens 15 min before the start, until the session ends. Marking somebody here is idempotent — a repeat tap keeps the first arrival time. Verified on a device: taps persist, undo clears cleanly. Replaces scanning as the main path. |
| Door check-in (scanner) | **Code only** | Scanner screen and `check_in_ticket` exist and are kept for larger events, but the welcome card is now the primary flow. Never run at a real door. |
| Booking log & filtering | **Not built** | |
| Handle reschedule requests | **Not built** | |
| Own sales reports | **Not built** | |
| Event FAQs | **Not built** | |
| Event media gallery | **Not built** | One cover image per event. |
| Posts, podcasts, broadcasts, archives | **Not built** | Four publishing surfaces in the old app. |
| Certifications | **Not built** | |
| Organisation registration | **Not built** | Venues sign up on web. |
| Own coupons | **Not built** | |

## Admin

| Feature | Status | Notes |
|---|---|---|
| Decision queue | **Done** | "What needs you" — everything waiting on a person. |
| Refund requests | **Done** | Apple and Google purchases handled correctly. |
| Reports & moderation | **Done** | Records the outcome and shows prior history for the same person. |
| Practitioner verification | **Done** | |
| Find someone | **Done** | Verify, certify, suspend. |
| Find a listing | **Done** | Events and services, drafts included. |
| Money view | **Done** | Totals, per-practitioner balances, recent payments. Simulated money reported separately. |
| Review moderation | **Done** | |
| Categories & specialities | **Not built** | Seeded once; no way to add or rename. |
| Blocked users view | **Not built** | |
| Activity log | **Not built** | No audit trail of who did what. |
| Roles & permissions | **Not built** | One flag: admin or not. |
| Send notifications | **Not built** | |
| Referrals, tax, currencies, pricing plans | **Not built** | |

## Platform

| Feature | Status | Notes |
|---|---|---|
| Supabase backend | **Done** | 46 migrations, row-level security on every table. |
| Server functions | **Done** | Checkout, booking, refund request, refund decision, push, Stripe webhook. |
| Stripe webhook wiring | **Done** | Endpoint registered in Stripe (`payment_intent.succeeded` / `.payment_failed`) and its signing secret set. **This was missing entirely** — payments succeeded and orders never fulfilled. |
| Live messaging & notifications | **Done** | |
| Image storage | **Done** | Buckets and rules. Writing to them depends on photo upload above. |
| Duplicate-charge protection | **Done** | Proven with concurrent checkouts. |
| Per-viewer cache isolation | **Done** | Conversation and notification keys carry the viewer id. |
| Account deletion sweep | **Done** | Daily at 03:15 UTC via pg_cron. Verified against a throwaway profile: refuses at 3 days, erases at 31. `deletion_sweep_status()` reports whether it is still scheduled. |
| iOS build | **Done** | |
| Android build | **Not built** | |
| Link to the Laravel database | **Not built** | Deliberate — the web app stays untouched. |

---

## Open product decisions

These are yours, not engineering's.

1. **What does "Certified" mean?** Nothing defines it — not the new app, not the
   old one. Two admin-set booleans with no stated criteria, now the most
   prominent thing on a practitioner card. In a wellness marketplace the badge
   implies MSN checked a qualification; if it's granted on judgement rather than
   a document, that's real exposure. Define it, or ship without it.
2. **Keep the seeker/practitioner question at signup?** Now that anyone can
   become a practitioner later, Airbnb's answer would be to stop asking.
3. **Stripe receipt emails** — `receipt_email` is passed to Stripe in both
   checkout functions, and payments are now live in test mode, so Stripe *will*
   send receipts to that address. Confirm that is wanted, or the field should be
   dropped.
