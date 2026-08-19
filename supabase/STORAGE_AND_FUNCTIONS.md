# Storage and functions

Covers migrations `0007_storage.sql`, `0008_functions.sql` and `0009_seed.sql`.
Run them in order, after `0006_rls.sql`.

---

## Storage

Five buckets. Four are public-read; `message-attachments` is private.

| Bucket | Public | Size limit | Accepts |
|---|---|---|---|
| `avatars` | yes | 5 MB | jpeg, png, webp, avif, heic/heif |
| `covers` | yes | 10 MB | jpeg, png, webp, avif, heic/heif |
| `event-images` | yes | 10 MB | jpeg, png, webp, avif, heic/heif |
| `galleries` | yes | 15 MB | jpeg, png, webp, avif, heic/heif |
| `message-attachments` | **no** | 25 MB | images, pdf, audio, mp4/mov |

Size and mime limits live on `storage.buckets`, not in the policies. An RLS
policy cannot see the content type of an object mid-upload, so the bucket
definition is the only place those can be enforced. Re-running `0007` resyncs
them.

### Path conventions

The first folder segment is the uuid that authorises the write. Policies do a
string comparison against `auth.uid()` instead of a join, which keeps them
cheap and readable.

```
avatars/<profile_id>/<filename>
covers/<profile_id>/<filename>
galleries/<profile_id>/<filename>              # or <profile_id>/<album>/<filename>
event-images/<host_profile_id>/<event_id>/<filename>
message-attachments/<conversation_id>/<sender_id>/<filename>
```

**`event-images` carries two segments.** Segment 1 must be the caller; segment 2,
if present, must be an event they host. Segment 2 is optional so a host can
upload before the event row exists (draft flow).

**`message-attachments` is the deliberate exception** — conversation id first,
not owner. Read access there is a property of the conversation, not of the
uploader: the recipient has to be able to open a file they did not upload, and
nobody outside the thread ever may. One membership check authorises the read.
There is no UPDATE policy on that bucket; a sent attachment is part of the
message record, so replacing the bytes behind a URL the other party has already
seen is not something the client can do. Delete-your-own is allowed.

### Uploading

```ts
const path = `${user.id}/${crypto.randomUUID()}.jpg`
await supabase.storage.from('avatars').upload(path, file, { upsert: true })

const { data } = supabase.storage.from('avatars').getPublicUrl(path)
// store data.publicUrl in profiles.avatar_url
```

Private bucket — the URL has to be signed, and the signing call is what the
select policy gates:

```ts
const path = `${conversationId}/${user.id}/${crypto.randomUUID()}.pdf`
await supabase.storage.from('message-attachments').upload(path, file)

const { data } = await supabase.storage
  .from('message-attachments')
  .createSignedUrl(path, 60 * 60)          // 1 hour
// store `path` in messages.attachment_url, not the signed URL — it expires
```

Store the **path** for private attachments and re-sign on read. Storing a signed
URL in `messages.attachment_url` produces links that work in QA and are dead by
the time anyone opens the thread again.

---

## Functions

All four are exposed over PostgREST as `rpc/<name>`. supabase-js passes
arguments **by name**, so the parameter names are part of the public API —
renaming one is a breaking change even though the SQL still compiles.

### `available_slots(provider, service, from_date, to_date)`

Bookable start times for one service across a date range.

```ts
const { data } = await supabase.rpc('available_slots', {
  provider:  providerId,
  service:   serviceId,
  from_date: '2026-08-12',
  to_date:   '2026-08-26',
})
// [{ slot_start: '2026-08-12T09:00:00Z', slot_end: '2026-08-12T10:00:00Z' }, …]
```

How it works:

1. Expands `availability_rules` across every date in the range. `from_date` and
   `to_date` are inclusive and are read as **local dates in each rule's own
   timezone**, so "Tuesdays 09:00 Europe/London" survives a DST boundary in the
   middle of the range.
2. Cuts each window into steps of `duration_minutes + buffer_minutes`. A slot
   must *finish* inside the window; the trailing buffer may fall outside it.
3. Drops anything in the past, anything overlapping an `availability_blocks`
   row, and anything overlapping a `requested` or `confirmed` booking. Bookings
   are widened by the buffer on both sides first, so a new booking can never
   start inside another's cool-down. Blocks are tested at full width — a block
   means "not here", not "not here plus turnaround".
4. `requested` holds time as firmly as `confirmed`: a pending request the
   provider has not answered yet must not be resold underneath them.
   `completed` counts too, for the provider who closes a booking out early.
   `declined`, `cancelled_by_*` and `no_show` release it.

   That set — `requested / confirmed / completed` — **must stay identical to
   `LIVE_BOOKING_STATUSES` in `functions/book-service`.** If this function is
   the looser of the two, the app offers a slot that `book-service` then
   rejects with a 409, which is the worst possible place to find out.

Returns **zero rows** — not an error — when the service is inactive, belongs to
a different provider, or `provider_details.accepts_bookings` is false. Failing
closed is the right default for an availability query.

> **This is the one `security definer` function.** Under `0006`,
> `availability_blocks` is visible only to the provider and `bookings` only to
> the two parties. A seeker running this with invoker rights would see neither,
> so every blocked and already-booked hour would come back free and the booking
> would collide at insert time. Correct slot generation is structurally
> impossible under invoker rights. It returns timestamps and nothing else — no
> block reasons, no counterparty, no booking ids.

### `search_events(q, near_lat, near_lng, radius_km, category, from_date, limit_n, offset_n)`

Published events only. Every argument optional.

```ts
const { data } = await supabase.rpc('search_events', {
  q:         'sound bath',
  near_lat:  51.5072,
  near_lng:  -0.1276,
  radius_km: 25,
  from_date: new Date().toISOString(),
  limit_n:   20,
  offset_n:  0,
})
```

- `q` goes through `websearch_to_tsquery`, so `"quoted phrases"` and a leading
  `-` to exclude both work. Whitespace-only `q` means "no text filter", not
  "match nothing".
- Geo activates only when `near_lat` **and** `near_lng` are both supplied;
  `radius_km` then defaults to 50. `earth_box()` is an index-servable
  bounding-cube prefilter, `earth_distance()` then trims the corners down to a
  true radius — both are needed, the box alone over-selects by up to ~27%.
- Events with `hide_exact_address` return null coordinates but a real
  `distance_km`. Events with no coordinates return null `distance_km`.
- Sort: relevance, then nearest, then soonest. With no `q` everything scores 0
  and it collapses to distance-then-date, which is the right browse default.
- `security invoker`, so the `published events are public` policy still decides
  visibility. Drafts stay invisible even to a query that would match them.

### `search_providers(q, speciality, near_lat, near_lng, radius_km, limit_n)`

```ts
const { data } = await supabase.rpc('search_providers', {
  q:          'trauma informed massage',
  speciality: specialityId,      // specialities.id, not a slug
  near_lat:   51.5072,
  near_lng:   -0.1276,
  radius_km:  30,
})
```

Excludes seekers and suspended accounts. Same geo and text rules as
`search_events`. `hide_exact_location` nulls the coordinates but not the
distance. Ratings come from `provider_rating()`, so hidden reviews stay out of
the average. Verified status is a tiebreak at equal relevance and distance, not
a ranking boost.

### `unread_counts(p_profile)`

One round trip for the two badges on every screen.

```ts
const { data } = await supabase.rpc('unread_counts')   // defaults to auth.uid()
// [{ unread_messages: 3, unread_notifications: 11 }]
```

A message is unread when someone else sent it, it is not soft-deleted, and it
postdates the caller's `conversation_participants.last_read_at` (null = never
opened the thread, so everything counts).

`security invoker` on purpose: RLS already scopes messages and notifications to
`auth.uid()`, so passing someone else's uuid returns zeroes rather than their
inbox size. The permission check is the same code path the rest of the app uses
rather than a second hand-written one.

### Indexes added by `0008`

| Index | For |
|---|---|
| `events_fts_idx` (GIN) | `search_events` text matching |
| `profiles_fts_idx` (GIN) | `search_providers` text matching |
| `bookings_provider_window_idx` (partial) | `available_slots` conflict lookup |

The GIN indexes are built on `events_search_doc()` / `profiles_search_doc()`,
immutable helpers that produce a weighted tsvector (A = title/name,
B = summary/headline, C = body). **The query and the index must use those
helpers verbatim.** Inline the expression in one place and not the other and the
index is silently ignored — search still returns correct results, on a
sequential scan over every event on the platform.

The geo predicates ride the existing GiST indexes from `0002` and `0003`
(`profiles_geo_idx`, `events_geo_idx`).

---

## Seed data

`0009_seed.sql` seeds the category tree only — eight top-level categories with
children, two levels deep, matching the app's chip-row-plus-sheet browse UI.
Both passes are `on conflict (slug) do nothing`, so re-running is a no-op and an
admin's later edits to a name or `sort_order` survive.

Slugs are the stable identifier. Names and ordering are editable; slugs are not.

**No users, events or bookings are seeded by a migration.** Migrations run in
production, and a fake provider is indistinguishable from a real one the moment
someone searches.

Demo content lives in `supabase/seed/demo_data.sql`, which `supabase db push`
never picks up. It refuses to run unless you set a flag first:

```bash
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
     -c "set msn.allow_demo_seed = 'on'" \
     -f supabase/seed/demo_data.sql
```

Undo:

```sql
delete from auth.users where email like '%@demo.mysourcenetwork.test';
```

All demo addresses use the reserved `.test` TLD, so none of them can resolve or
receive mail.

Two things that file has to work around, worth knowing if you extend it:

- **`account_type` must travel in `raw_user_meta_data`.** The
  `profiles_guard_trust_flags` trigger from `0006` reverts `account_type` on any
  update by a non-admin, and a psql session has no `auth.uid()`. Setting it
  after the insert silently snaps back to `seeker`. `handle_new_user()` reads it
  out of the metadata at insert time instead.
- **`is_verified` / `is_certified` need the trigger disabled.** Same reason. The
  seed disables `profiles_guard_trust_flags` for the length of the block and
  re-enables it, inside one transaction so a failure rolls the `ALTER` back too.
  That is a development-only manoeuvre; in production those flags are set by an
  admin or by an Edge Function using the service-role key.
