import type { BadgeTone } from '@/components/ui';
import { formatPrice } from '@/lib/format';
import type { EventSearchResult, EventWithHost } from '@/lib/queries/events';
import type { Category, DeliveryMode } from '@/types/database';

/**
 * One card's worth of event.
 *
 * Discover reads events from two different shapes and has to render one card
 * from both:
 *
 *   - `listEvents()` returns `EventWithHost` — a full `events` row plus the
 *     host and category embeds. Used for a plain browse.
 *   - `searchEvents()` returns `EventSearchResult` — the flat projection the
 *     `search_events` SQL function emits, with `distance_km` and `relevance`
 *     but no embeds and fewer columns.
 *
 * CONVENTIONS §5 is explicit about when each applies ("use `searchEvents`
 * whenever `filters.near` or a text query is present; use `listEvents` for a
 * plain browse"), so both are live and the card needs a shape that does not
 * change under the user as they type. This is the intersection of the two,
 * which is why there is no host block on the card — `search_events` does not
 * return one, and a card that grows a "Hosted by" row the moment you clear the
 * search box is worse than one that never had it.
 */
export interface DiscoverEvent {
  id: string;
  title: string;
  summary: string | null;
  cover_url: string | null;
  starts_at: string;
  ends_at: string;
  /** The EVENT's zone, not the viewer's. See `locationLabel` and CONVENTIONS §8. */
  timezone: string;
  delivery_mode: DeliveryMode;
  venue_name: string | null;
  city: string | null;
  region: string | null;
  currency: string;
  is_free: boolean;
  /**
   * Cheapest currently-buyable ticket, in cents. Null means nothing is on
   * sale right now — which is NOT the same as free.
   */
  min_price_cents: number | null;
  /** Only populated by `searchEvents` with a `near` filter. */
  distance_km: number | null;
  /**
   * Who is running it. This is a marketplace built on people — a seeker picks a
   * circle because of who leads it — so the card names them. Null only when the
   * host row is missing or unreadable; the card then simply omits the line
   * rather than showing a blank avatar.
   */
  host: {
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
  } | null;
  /**
   * Retreats get called out on the card. A retreat is a different kind of
   * purchase from an evening circle — days rather than hours, usually travel,
   * usually a much larger sum — and the card's own facts do not make that
   * obvious: "Sun 27 Sep, 10:00 AM – 5:00 PM" reads like any other listing
   * until you notice it spans a whole day.
   */
  is_retreat: boolean;
  /**
   * Carried so the retreat flag can be re-derived once the categories arrive.
   * The search projection has no slug, and events and categories load in
   * whichever order the network decides.
   */
  category_id: string | null;
}

/**
 * Whether a category slug names a retreat.
 *
 * Keyed on the slug, not the name, because the names do not all say it — the
 * "Wilderness & Nature" and "Detox & Reset" categories are `wilderness-retreats`
 * and `detox-retreats`. The slug is the reliable signal, and the suffix rule
 * means a retreat category added next year is labelled without anyone
 * remembering to come back here.
 */
export function isRetreatSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return slug === 'retreats' || slug.endsWith('-retreats');
}

/**
 * The retreat category ids, for the search projection.
 *
 * `search_events` returns `category_id` and no slug, so the caller resolves it
 * from the categories Discover has already loaded for its filter row rather
 * than the card making a second request per tile.
 */
export function retreatCategoryIds(
  categories: readonly Pick<Category, 'id' | 'slug'>[] | undefined,
): ReadonlySet<string> {
  return new Set((categories ?? []).filter((c) => isRetreatSlug(c.slug)).map((c) => c.id));
}

export function fromEventRow(row: EventWithHost): DiscoverEvent {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    cover_url: row.cover_url,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    timezone: row.timezone,
    delivery_mode: row.delivery_mode,
    venue_name: row.venue_name,
    city: row.city,
    region: row.region,
    currency: row.currency,
    is_free: row.is_free,
    min_price_cents: row.min_price_cents,
    distance_km: null,
    // This shape embeds the category, so the slug answers it directly.
    is_retreat: isRetreatSlug(row.category?.slug),
    category_id: row.category_id,
    host: row.host
      ? {
          display_name: row.host.display_name,
          avatar_url: row.host.avatar_url,
          is_verified: row.host.is_verified,
        }
      : null,
  };
}

export function fromEventSearchResult(row: EventSearchResult): DiscoverEvent {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    cover_url: row.cover_url,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    timezone: row.timezone,
    delivery_mode: row.delivery_mode,
    venue_name: row.venue_name,
    city: row.city,
    region: row.region,
    currency: row.currency,
    is_free: row.is_free,
    min_price_cents: row.min_price_cents,
    distance_km: row.distance_km,
    // The search projection has no slug, so this shape cannot answer it alone.
    // Discover fills it in from the categories it has already loaded.
    is_retreat: false,
    category_id: row.category_id,
    // Flattened by `search_events` (migration 0023) rather than embedded, so
    // one flat row type covers a result. A null name means the left join found
    // no readable host.
    host: row.host_display_name
      ? {
          display_name: row.host_display_name,
          avatar_url: row.host_avatar_url,
          is_verified: row.host_is_verified,
        }
      : null,
  };
}

/**
 * The price badge, as a label and a tone.
 *
 * `min_price_cents` is the cheapest ticket a person could buy right now —
 * active, inside its sales window, not sold out. It comes from one SQL
 * definition shared by `search_events` and the plain browse select (migration
 * 0013), so the badge cannot change as the user types.
 *
 * Four states, and conflating any two of them misleads:
 *
 *   | Condition                          | Label     | Why                    |
 *   |------------------------------------|-----------|------------------------|
 *   | `is_free`                          | "Free"    | the host said so       |
 *   | cheapest buyable tier is 0         | "Free"    | you can get in for 0   |
 *   | a buyable price                    | "From €22"| the web's `.price-badge` |
 *   | `null`                             | "Sold out"| nothing is on sale, which is NOT free |
 *
 * The zero case is the one that used to read **"From Free"**: `formatPrice`
 * turns 0 into the word "Free" (a `€0.00` on a card reads as a rendering
 * failure), and prefixing that with "From" produced nonsense. A paid event
 * with one free tier — a donation event, a "supporter" tier at 0 — is ordinary,
 * so this is reachable rather than theoretical.
 *
 * Currency is per EVENT, never a global: `event.currency` is carried on both
 * query shapes and passed through here, so a EUR event and a GBP event render
 * side by side correctly.
 */
export function priceBadge(event: DiscoverEvent): { label: string; tone: BadgeTone } {
  if (event.min_price_cents === null && !event.is_free) {
    return { label: 'Sold out', tone: 'danger' };
  }
  if (event.is_free || event.min_price_cents === 0) {
    return { label: formatPrice(0, event.currency, { isFree: true }), tone: 'success' };
  }
  // `min_price_cents` is non-null and non-zero by the two guards above, but the
  // narrowing does not survive the `is_free` disjunction, hence the fallback.
  const cents = event.min_price_cents ?? 0;
  return { label: `From ${formatPrice(cents, event.currency)}`, tone: 'neutral' };
}

/**
 * "Online", a venue, or the nearest thing to a place we have.
 *
 * `hide_exact_address` is not consulted because neither query shape returns
 * `address_line1` — the card only ever shows venue name and city, which is
 * what the web listing card shows too.
 */
export function locationLabel(event: DiscoverEvent): string {
  if (event.delivery_mode !== 'in_person') return 'Online';

  const place = [event.city, event.region].filter(Boolean).join(', ');
  if (event.venue_name && place) return `${event.venue_name}, ${place}`;
  return event.venue_name ?? (place === '' ? 'Location to be announced' : place);
}
