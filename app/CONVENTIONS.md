# MSN app — conventions

How this codebase is put together and how to add to it. Read this before
writing a screen. It is prescriptive on purpose: several agents build features
here in parallel, and consistency is what keeps that from producing four
different ways to fetch a list.

---

## 1. Setup

```bash
cd msn-app/app
cp .env.example .env      # fill in EXPO_PUBLIC_SUPABASE_URL + ANON_KEY
npm install
npx expo start
```

Env vars are **inlined at bundle time**. After editing `.env`, restart with
`npx expo start --clear` — a hot reload will not pick them up, and the symptom
is a confusing "missing Supabase URL" throw from a file you did not touch.

`npm run typecheck` before you hand anything over. There is no `any` in this
codebase and it should stay that way.

---

## 2. Folder structure

```
msn-app/app/
├── app.config.ts          Expo config. Env-driven; no secrets.
├── tsconfig.json          strict, plus @/* → ./src/*
├── .env.example           the committed template. .env is gitignored.
├── DESIGN_SOURCE.md       where the design tokens came from
├── CONVENTIONS.md         this file
└── src/
    ├── app/               ROUTES ONLY (expo-router). See §3.
    │   ├── _layout.tsx        providers + the auth route guard
    │   ├── +not-found.tsx
    │   ├── (auth)/            sign-in, sign-up, forgot-password, verify-otp
    │   ├── (tabs)/            Discover, Bookings, Messages, Profile
    │   └── (modal)/           detail screens presented over the tabs
    ├── components/
    │   ├── ui/            the design system. See §6.
    │   └── auth/          auth-specific shared pieces
    ├── context/
    │   └── AuthContext.tsx
    ├── lib/
    │   ├── supabase.ts        the ONE client
    │   ├── secure-store-adapter.ts
    │   ├── query-client.ts    React Query defaults
    │   ├── errors.ts          AppError and the mappers
    │   ├── format.ts          money + dates. See §8.
    │   ├── validation.ts
    │   └── queries/           the data layer. See §5.
    ├── theme/             design tokens. See §7.
    └── types/
        └── database.ts    generated Supabase types + app aliases
```

**Nothing but routes goes in `src/app/`.** expo-router turns every file there
into a navigable route, so a helper dropped in `(tabs)/` becomes a screen. Put
shared pieces in `src/components/`.

---

## 3. Adding a screen

Routes are files. The path is the URL.

| Where it goes | When |
|---|---|
| `src/app/(tabs)/x.tsx` | A top-level destination. Requires a matching `<Tabs.Screen>` in `(tabs)/_layout.tsx`. Four tabs is the limit. |
| `src/app/(modal)/x/[id].tsx` | A detail screen reached from a card or row. **Most new screens.** |
| `src/app/(auth)/x.tsx` | Pre-authentication only. |

### The shape every screen has

```tsx
export default function ThingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: qk.things.detail(id),
    queryFn: () => getThing(id),
    enabled: Boolean(id),
  });

  if (isPending) return <Screen><SkeletonList /></Screen>;
  if (isError)   return <Screen><ErrorState error={error} onRetry={() => void refetch()} /></Screen>;
  if (!data)     return <Screen><EmptyState title="Not found" /></Screen>;

  return <Screen scroll safeBottom>{/* ... */}</Screen>;
}
```

**All four branches are mandatory.** A screen that renders `data.title` without
a pending branch will crash on first paint; one without an error branch shows a
blank page when the network drops. Reviews should reject screens missing any of
them.

Start every screen with `<Screen>` so gutters line up across tabs. Use
`safeBottom` on modal and stack screens, not inside `(tabs)` — the tab bar
already covers the inset.

### Route protection

Handled centrally in `src/app/_layout.tsx`. Every group is always mounted and a
single effect redirects when the user is in the wrong one. **Do not add your own
auth check to a screen** — and never gate on `session === null` directly, because
that is also true for a few hundred milliseconds at cold start while SecureStore
is read. Gate on `initialising` if you must gate at all.

---

## 4. Naming

| Thing | Convention | Example |
|---|---|---|
| Component files | `PascalCase.tsx` | `EventCard.tsx` |
| Route files | expo-router's rules | `[id].tsx`, `_layout.tsx` |
| Everything else | `kebab-case.ts` | `query-client.ts` |
| Components / types | `PascalCase` | `EventCard`, `BookingStatus` |
| Functions / vars | `camelCase` | `listEvents`, `isRefetching` |
| Constants | `SCREAMING_SNAKE` | `PAGE_SIZE` |
| Database fields | `snake_case`, untouched | `starts_at`, `price_cents` |

**Do not camelCase database fields.** `event.starts_at` stays `starts_at` all
the way to the JSX. A mapping layer would double every type for no gain and
guarantees drift.

Query functions read as verbs: `listEvents`, `getEvent`, `createBooking`,
`updateProfile`, `searchEvents`.

`EventRow`, not `Event` — `Event` is a React Native global and shadowing it
produces genuinely baffling errors.

---

## 5. Querying data

**Screens never call `supabase.from(...)`.** Every database call lives in
`src/lib/queries/` and screens call those through React Query.

### Reading

```tsx
const { data, isPending, isError, error } = useQuery({
  queryKey: qk.events.list(filters),
  queryFn: () => listEvents(filters),
});
```

Keys come from `qk` in `lib/queries/keys.ts`. **Never hand-write a key.**
Invalidation works by prefix — `invalidateQueries({ queryKey: qk.events.all })`
clears every event query — and that only holds if all keys are built the same
way. Filters are part of the key, or a filtered list and an unfiltered one
overwrite each other.

### Writing

```tsx
const queryClient = useQueryClient();
const mutation = useMutation({
  mutationFn: (input: BookingInsert) => createBooking(input),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.bookings.all }),
});
```

Mutations do not retry by default (`query-client.ts`). A retried "create
booking" is a double booking. Opt in per mutation only when the call is
genuinely idempotent.

### Adding a query function

```ts
export async function listThings(filters: ThingFilters): Promise<Thing[]> {
  return unwrap(
    supabase.from('things').select('*').eq('is_active', true),
    'load things',
  );
}
```

- Return the data. **Throw on failure** — `unwrap()` converts Supabase's
  `{ data, error }` into a resolved value or a thrown `AppError`. The
  `{ data, error }` shape stops there and never reaches a screen, because
  React Query's `isError` branch only works with a rejected promise.
- `context` completes "Could not ___." — write it as a lowercase verb phrase.
- Use `unwrapMaybe` with `.maybeSingle()` when "no row" is a legitimate answer.
- Paginate with `rangeFor(page)`; feed `useInfiniteQuery` with `nextPage`.
- For embedded selects, type the result explicitly and use `.returns<T>()`.
  Inference across two foreign keys to the same table is unreliable, which is
  why the selects here name their constraints:
  `provider:profiles!bookings_provider_id_fkey(...)`.

### Some things throw `NotImplementedError` on purpose

`createOrder` and `createBooking` are not stubs waiting for someone to write
the client half. Implementing them client-side would be a correctness bug:

- Ticket stock has to move atomically with the order, or the event oversells
  after the card is charged.
- Totals recomputed from `ticket_types.price_cents` server-side; a
  client-supplied `total_cents` is a client-supplied price.
- Slot reservation and payment must be one transaction, or two seekers book
  the same hour.
- Store receipts (`apple_iap`, `google_play`) are validated server-side or not
  at all.

They need Edge Functions. Read the comment on the function before "finishing"
one.

Conversely, several things that look like they need writing already exist as
SQL functions and should be called, not reimplemented: `available_slots`,
`search_events`, `search_providers`, `provider_rating`, `unread_counts`.
Proximity and full-text ranking are **not** doable through PostgREST — do not
fetch the catalogue and filter on the phone.

---

## 5b. Where state lives

Three tiers, and the boundaries are not negotiable:

| Kind of state | Where | Example |
|---|---|---|
| Anything from the database | **React Query** | events, bookings, the profile row |
| Session and current user | **`AuthContext`** | `session`, `profile`, `signOut` |
| Ephemeral client state | **`useState`**, or **Zustand** if shared | a filter draft, a composer's text |

**Never copy server data into `useState`.** A `useEffect` that mirrors query
data into local state is how a screen ends up showing a stale price after a
refetch. Read it from the query.

`zustand` is a dependency for the third tier — filter state that Discover
shares with a filter sheet, a multi-step booking draft. It is deliberately
unused so far: nothing yet needs client state that outlives one screen. Reach
for it only when prop-drilling actually hurts, and never for anything that
came from Supabase.

---

## 6. Using the UI kit

```tsx
import { Button, Card, Text, EmptyState } from '@/components/ui';
```

| Component | Notes |
|---|---|
| `Text` | The **only** text primitive. RN's `<Text>` has no font family and renders in the system face. |
| `Button` | `primary` / `secondary` / `ghost` / `danger`. Has `loading` and `disabled`. |
| `Card` | `elevated` / `outlined` / `filled`. `onPress` makes it one accessible button. |
| `Input` | Always-visible label, `error`, `hint`, `required`. |
| `Avatar` | Initials fallback. |
| `Badge` | Non-interactive status. Use the `*StatusBadge()` mappers. |
| `Chip` | Interactive filter. Announces as a checkbox. |
| `Skeleton` / `SkeletonList` | The pending branch. |
| `EmptyState` | Query succeeded, nothing there. |
| `ErrorState` | Query failed. |
| `Screen` | Container. Start every screen with it. |

Before writing a new primitive, check whether these compose into it. A second
Button implementation is how a design system dies.

### Status labels go through the mappers

`eventStatusBadge`, `bookingStatusBadgeFor`, `orderStatusBadge`,
`refundStatusBadge` in `Badge.tsx` are the single place a database enum becomes
a human label. The same status must never read "Cancelled" on one screen and
"Called off" on another.

### Accessibility is not optional

- Tap targets ≥ 44pt. Use `touchSlop(size)` for anything visually smaller.
- Every icon-only control needs an `accessibilityLabel`.
- Screen and section titles get `heading={1}` / `heading={2}` — this is what
  lets VoiceOver and TalkBack jump between sections instead of reading a flat
  wall of text.
- A destructive action gets an `accessibilityHint` describing the consequence.
- Composite rows (avatar + name + meta) should be **one** accessible node with
  a composed label, not five stops.

---

## 7. Using the theme

```tsx
const theme = useTheme();
<View style={{ padding: theme.spacing.md, backgroundColor: theme.colors.surface }} />
```

For anything inside a list, build styles once instead of allocating a new
object every render:

```tsx
const useStyles = makeStyles((t) => ({
  row: { padding: t.spacing.md, backgroundColor: t.colors.surface },
}));
```

### Two rules

1. **No hex literals outside `src/theme/`.** Ever. Colours come from
   `useTheme().colors` by semantic name.
2. **No component imports `extracted-tokens.ts`.** That file holds the raw
   brand values translated from the live MSN web app and is expected to be
   replaced wholesale as the extraction improves. The indirection is what makes
   that swap free.

If the colour you want does not exist, add it to `ColorTokens` in
`extracted-tokens.ts` and map it in both `lightColors` and `darkColors` —
do not reach past the semantic layer.

Key names: `background`, `surface`, `surfaceMuted`, `surfaceSunken`,
`surfaceElevated`, `border`, `borderStrong`, `textHeading`, `textPrimary`,
`textSecondary`, `textMuted`, `textPlaceholder`, `textOnAccent`, `accent`,
`accentPressed`, `accentSubtle`, `accentText`, `accentDeep`, plus
`success`/`warning`/`danger` families.

`accent` (magenta `#913688`) is what you tap. `accentDeep` (plum `#301432`) is
brand furniture — headers, dark panels. They are not interchangeable.

**Dark mode is derived, not extracted** — the web app is light-only. Test in
both, and treat dark as provisional.

---

## 8. Money and dates

### Money is integer cents

The database stores `*_cents` integers. They stay integers through every sum,
comparison and calculation. They become a string exactly once, at render:

```tsx
formatMoney(service.price_cents, service.currency)   // "$45.00"
formatPrice(event.price_cents, event.currency, { isFree: event.is_free })
```

If you write `price / 100` outside `lib/format.ts`, that is the bug.

### Dates: two cases, and picking wrong is the classic marketplace bug

**An offering's own time** — `events.starts_at`, `bookings.starts_at` — renders
in the **offering's** `timezone` column. A retreat that starts at 9am in Bali
starts at 9am in Bali no matter who is looking:

```tsx
formatEventRange(event.starts_at, event.ends_at, event.timezone)
timeZoneSuffix(event.timezone)   // null when the viewer is in the same zone
```

**A platform event** — message sent, order placed — renders in the **viewer's**
zone, because it is about them:

```tsx
formatMessageTime(message.created_at)
formatRelative(order.created_at)
```

Never `new Date(iso).toLocaleString()` in a screen. It silently uses the device
zone for both cases and gets the first one wrong.

### Cancellation windows come from the booking

`bookings.cancellation_window_hours` is snapshotted at purchase time. Always
read it from the **booking**, never from the service — the service may have been
edited since, and refund policy §2.3 says undisclosed terms are not binding.
`isWithinCancellationWindow(booking)` does this correctly.

---

## 9. Errors and loading

Everything below the query layer throws `AppError`, which carries a `kind`
(`network` / `auth` / `forbidden` / `not_found` / `validation` / `rate_limited`
/ `not_implemented` / `unknown`) and a `retryable` flag.

- **Render `error.message`, log `error.cause`.** The message is written for a
  user; the cause is Postgres constraint text and reads like a stack trace.
- **Only offer retry when it might work.** `ErrorState` checks `retryable`
  automatically. Showing "Try again" on a `forbidden` teaches people to tap a
  button that will never help.
- Use `<ErrorState>` for a failed screen, `<FormError>` for a failed submit.

Loading:

- Known shape (a list, a profile header) → `Skeleton` / `SkeletonList`, sized to
  match the real content so nothing jumps.
- An action in flight → `Button`'s `loading` prop.
- Skeletons are hidden from assistive tech; announce state changes with
  `accessibilityLiveRegion` on the container instead.

---

## 10. Things the database will not let you do

Worth knowing before you build UI for them.

- **Trust flags are not writable.** `is_verified`, `is_certified`, `is_admin`,
  `is_suspended` and `account_type` are silently reverted by a trigger for
  non-admins. The write succeeds and changes nothing — so never render an input
  for them. `account_type` is settable exactly once, at signup, through
  `raw_user_meta_data`.
- **Orders are not client-mutable.** RLS allows buyers to INSERT and SELECT.
  Status transitions happen in Edge Functions. A client `update` matches zero
  rows rather than erroring.
- **Publishing an event sets two columns at once.**
  `events_published_has_timestamp` requires `published_at` in the same
  statement as `status = 'published'`. Use `publishEvent()`.
- **A non-`in_person` event needs a `meeting_url` to leave draft**
  (`events_online_needs_link`). Validate in the form so the user gets a
  field-level message rather than a check-constraint error.
- **Reviews need a transaction.** `review_needs_transaction` requires an
  `order_id` or `booking_id`. There is no drive-by rating.
- **You cannot message someone who blocked you.** RLS rejects the INSERT.
  Check `isBlockedBetween` before rendering the composer.
- **Payment rail is not a preference.** `railFor(delivery_mode, Platform.OS)`:
  `online_live` on iOS **must** use Apple IAP (3.1.3(d)); `in_person` **must
  not** (3.1.3(e)). Getting it wrong is a rejected build.
- **Store purchases cannot be refunded by us.** Call `refundRouteFor(rail)`
  before offering a refund — `apple_iap` and `google_play` send the customer to
  the store instead.

---

## 11. Realtime

`messages`, `conversations` and `notifications` are in the `supabase_realtime`
publication. Subscribe; do not poll.

```tsx
useEffect(() => {
  const channel = subscribeToMessages(conversationId, (message) => { /* patch cache */ });
  return () => { void channel.unsubscribe(); };
}, [conversationId]);
```

**Always unsubscribe in the cleanup**, or every thread the user opens leaks a
socket subscription. Realtime payloads are bare rows — no embedded `sender`,
because Realtime does not run your select.

---

## 12. Before you open a PR

- [ ] `npm run typecheck` passes. No `any`, no `@ts-expect-error`.
- [ ] Every new screen handles pending, error, empty and success.
- [ ] No hex literals outside `src/theme/`.
- [ ] Screens do not call `supabase` directly.
- [ ] Query keys come from `qk`.
- [ ] Money formatted only at render; no arithmetic on formatted strings.
- [ ] Offering times rendered in the offering's zone.
- [ ] Tap targets ≥ 44pt; icon-only controls labelled.
- [ ] Checked in light **and** dark.
- [ ] `TODO(agent · area)` left on anything deliberately unfinished, saying what
      is needed and why — not just that it is missing.
