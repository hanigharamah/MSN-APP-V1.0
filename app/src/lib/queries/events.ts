import { supabase } from '@/lib/supabase';
import type {
  Category,
  DeliveryMode,
  EventImage,
  EventInsert,
  EventOccurrence,
  EventRow,
  EventUpdate,
  Profile,
  TicketType,
} from '@/types/database';
import type { EventListFilters } from './keys';
import { PAGE_SIZE, rangeFor, unwrap, unwrapMaybe } from './client';

/**
 * Events — one-to-many, ticketed offerings.
 *
 * `events.status` is the ONLY signal for whether an event is live. Do not
 * derive visibility from `published_at`, from dates, or from anything else.
 * RLS already hides other people's drafts, so a list query does not need to
 * filter by host.
 */

export type EventWithHost = EventRow & {
  host: Pick<
    Profile,
    'id' | 'display_name' | 'avatar_url' | 'handle' | 'is_verified' | 'account_type'
  > | null;
  category: Pick<Category, 'id' | 'name' | 'slug'> | null;
};

// `min_price_cents` is a PostgREST computed column (migration 0013), not a
// real column — it delegates to the same SQL `search_events` uses, so the
// browse and search paths cannot report different prices.
const EVENT_WITH_HOST_SELECT =
  '*, min_price_cents, host:profiles!events_host_id_fkey(id, display_name, avatar_url, handle, is_verified, account_type), category:categories(id, name, slug)';

// -----------------------------------------------------------------------------
// Read
// -----------------------------------------------------------------------------

export async function listEvents(
  filters: EventListFilters = {},
  page = 0,
): Promise<EventWithHost[]> {
  const [from, to] = rangeFor(page);

  let query = supabase.from('events').select(EVENT_WITH_HOST_SELECT).eq('status', 'published');

  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.deliveryModes?.length) query = query.in('delivery_mode', filters.deliveryModes);
  if (filters.onlyFree) query = query.eq('is_free', true);
  // Same rule as `search_events` (migration 0043): a floor drops the free
  // events with it, a ceiling keeps them. If the two paths disagreed here,
  // typing in the search box would change which events match.
  if (filters.minPriceCents !== undefined) {
    query = query.gte('min_price_cents', filters.minPriceCents);
  }
  if (filters.maxPriceCents !== undefined) {
    query = query.or(`min_price_cents.lte.${filters.maxPriceCents},min_price_cents.is.null`);
  }
  if (filters.search) {
    query = query.or(`title.ilike.%${filters.search}%,summary.ilike.%${filters.search}%`);
  }
  // Default to hiding events that have already started — a marketplace feed
  // full of past events is the most common "the app looks broken" complaint.
  query = query.gte('starts_at', filters.startsAfter ?? new Date().toISOString());

  return unwrap(
    query.order('starts_at', { ascending: true }).range(from, to).returns<EventWithHost[]>(),
    'load events',
  );
}

/**
 * One row of `search_events`. It is a flat projection with a computed
 * `distance_km` and `relevance`, NOT an `events` row — there is no host or
 * category embed, and several columns are absent. Render the card from this,
 * then load the full event on tap.
 */
export interface EventSearchResult {
  id: string;
  slug: string | null;
  title: string;
  summary: string | null;
  cover_url: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  delivery_mode: DeliveryMode;
  currency: string;
  is_free: boolean;
  host_id: string;
  category_id: string | null;
  venue_name: string | null;
  city: string | null;
  region: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Cheapest currently-buyable ticket, in cents. Null = nothing on sale. */
  min_price_cents: number | null;
  /**
   * The host, flattened by `search_events` (migration 0023) so a result stays
   * one flat row. Null when the left join found no readable profile — the card
   * then omits the host line rather than rendering a blank one.
   */
  host_display_name: string | null;
  host_handle: string | null;
  host_avatar_url: string | null;
  host_is_verified: boolean;
  /** Null unless `near_lat` / `near_lng` were supplied. */
  distance_km: number | null;
  /** Full-text rank. Null unless `q` was supplied. */
  relevance: number | null;
}

/**
 * Full-text and proximity search over published events.
 *
 * This is a `search_events` RPC rather than a PostgREST query because neither
 * half is expressible through PostgREST: the geo filter needs the
 * `earthdistance` GiST index (`ll_to_earth`), and ranking needs `ts_rank` over
 * the `events_search_doc` vector. Fetching everything and filtering on the
 * client is not an alternative — it would ship the whole catalogue to the
 * phone and still rank it wrong.
 *
 * Use this whenever `filters.near` or a text query is present; use
 * `listEvents` for a plain browse.
 */
export async function searchEvents(
  filters: EventListFilters = {},
  page = 0,
  pageSize = PAGE_SIZE,
): Promise<EventSearchResult[]> {
  return unwrap(
    supabase.rpc('search_events', {
      q: filters.search,
      category: filters.categoryId,
      from_date: filters.startsAfter,
      near_lat: filters.near?.latitude,
      near_lng: filters.near?.longitude,
      radius_km: filters.near?.radiusKm,
      delivery: filters.deliveryModes?.length ? filters.deliveryModes : undefined,
      free_only: filters.onlyFree ?? false,
      min_price: filters.minPriceCents,
      max_price: filters.maxPriceCents,
      limit_n: pageSize,
      offset_n: page * pageSize,
    }),
    'search events',
  );
}

export async function getEvent(eventId: string): Promise<EventWithHost | null> {
  return unwrapMaybe(
    supabase
      .from('events')
      .select(EVENT_WITH_HOST_SELECT)
      .eq('id', eventId)
      .maybeSingle()
      .returns<EventWithHost | null>(),
    'load that event',
  );
}

export async function getEventBySlug(slug: string): Promise<EventWithHost | null> {
  return unwrapMaybe(
    supabase
      .from('events')
      .select(EVENT_WITH_HOST_SELECT)
      .eq('slug', slug)
      .maybeSingle()
      .returns<EventWithHost | null>(),
    'load that event',
  );
}

/**
 * Ticket types for an event, sale-window aware.
 *
 * `quantity === null` means unlimited. `quantity_sold` is maintained by the
 * checkout Edge Function — never increment it from the client.
 */
export async function listTicketTypes(eventId: string): Promise<TicketType[]> {
  return unwrap(
    supabase
      .from('ticket_types')
      .select('*')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('price_cents', { ascending: true }),
    'load tickets',
  );
}

export async function listEventOccurrences(eventId: string): Promise<EventOccurrence[]> {
  return unwrap(
    supabase
      .from('event_occurrences')
      .select('*')
      .eq('event_id', eventId)
      .eq('is_cancelled', false)
      .order('starts_at', { ascending: true }),
    'load dates',
  );
}

export async function listEventImages(eventId: string): Promise<EventImage[]> {
  return unwrap(
    supabase.from('event_images').select('*').eq('event_id', eventId).order('sort_order'),
    'load images',
  );
}

/**
 * Every event a host has listed, drafts included, newest EDIT first.
 *
 * Separate from `listEventsHostedBy` on purpose, and the difference is not
 * cosmetic:
 *
 *   - **Order.** Listings claims "most recently touched first" and merges
 *     events with services on `updated_at`. `listEventsHostedBy` orders by
 *     `starts_at`, so merging its output would sort one half of the list by a
 *     field the other half is not sorted by.
 *   - **No paging.** Listings has no `onEndReached`. Taking a 20-row page and
 *     rendering it as if it were the whole set meant a host with 21 listings
 *     silently lost the rest, AND the count line said "20 events" as though
 *     that were the total. The cap here is a backstop against a runaway query,
 *     not a page: nobody has 500 listings, and if anyone ever does, this
 *     screen needs an infinite list rather than a bigger number.
 *
 * It also needs its own cache key. `listEventsHostedBy` is consumed by
 * `(provider)/events/index` through `useInfiniteQuery`, which stores
 * `{pages, pageParams}` — sharing a key with a plain `useQuery` put two
 * incompatible shapes in one cache entry and threw on whichever screen was
 * visited second.
 */
const LISTINGS_HARD_CAP = 500;

export async function listEventsHostedByRecent(hostId: string): Promise<EventRow[]> {
  return unwrap(
    supabase
      .from('events')
      .select('*, min_price_cents')
      .eq('host_id', hostId)
      .order('updated_at', { ascending: false })
      .range(0, LISTINGS_HARD_CAP - 1),
    'load your events',
  );
}

/** Everything a host has listed, drafts included. RLS scopes it to them. */
export async function listEventsHostedBy(hostId: string, page = 0): Promise<EventRow[]> {
  const [from, to] = rangeFor(page);
  return unwrap(
    supabase
      .from('events')
      .select('*, min_price_cents')
      .eq('host_id', hostId)
      .order('starts_at', { ascending: false })
      .range(from, to),
    'load your events',
  );
}

export async function listCategories(): Promise<Category[]> {
  return unwrap(
    supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .order('name'),
    'load categories',
  );
}

// -----------------------------------------------------------------------------
// Write
// -----------------------------------------------------------------------------

export async function createEvent(input: EventInsert): Promise<EventRow> {
  return unwrap(supabase.from('events').insert(input).select('*').single(), 'create that event');
}

export async function updateEvent(eventId: string, patch: EventUpdate): Promise<EventRow> {
  return unwrap(
    supabase.from('events').update(patch).eq('id', eventId).select('*').single(),
    'save that event',
  );
}

/**
 * Publishing sets both columns in one statement, because
 * `events_published_has_timestamp` requires `published_at` whenever status is
 * `'published'`. Setting status alone fails the check constraint.
 *
 * `events_online_needs_link` also applies: a non-`in_person` event must have a
 * `meeting_url` before it can leave draft. Validate that in the form so the
 * user gets a field-level message rather than a database error.
 */
export async function publishEvent(eventId: string): Promise<EventRow> {
  return updateEvent(eventId, { status: 'published', published_at: new Date().toISOString() });
}

export async function cancelEvent(eventId: string): Promise<EventRow> {
  // TODO(agent · events): cancelling a published event with paid orders must
  // also open refunds. That belongs in an Edge Function so the refund and the
  // status change are one transaction — do not chain two client calls.
  return updateEvent(eventId, { status: 'cancelled' });
}
