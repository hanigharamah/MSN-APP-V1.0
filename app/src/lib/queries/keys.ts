import type { BookingStatus, DeliveryMode } from '@/types/database';

/**
 * React Query key factory.
 *
 * Every key in the app comes from here. Two reasons:
 *
 * 1. Invalidation works by prefix. `queryClient.invalidateQueries({ queryKey:
 *    qk.events.all })` clears every event query — list, detail, host's own —
 *    because they all start with `['events']`. That only holds if nobody
 *    hand-writes a key somewhere.
 * 2. Filters are part of the key. A search for "sound healing in Austin" is a
 *    different cache entry from an unfiltered list, and it has to be, or the
 *    two overwrite each other.
 *
 * Keys are `as const` so they are readonly tuples and TypeScript can tell them
 * apart.
 */

export interface EventListFilters {
  categoryId?: string;
  specialityId?: string;
  /**
   * Delivery modes to include. Empty or absent means every mode.
   *
   * A list rather than one value because "online or in person" is a real
   * request, and the alternative is one query per mode merged on the client.
   */
  deliveryModes?: DeliveryMode[];
  /** Free-text search over title and summary. */
  search?: string;
  /** ISO date; events starting on or after this. */
  startsAfter?: string;
  /** Proximity search. Requires all three. */
  near?: { latitude: number; longitude: number; radiusKm: number };
  onlyFree?: boolean;
  /**
   * Price band, in cents, against the cheapest ticket currently on sale — the
   * same number the card prints as "From £65".
   *
   * A floor excludes free events (nothing cannot cost at least £20); a ceiling
   * keeps them. Both paths agree on this, and so does `search_events`.
   */
  minPriceCents?: number;
  maxPriceCents?: number;
}

export interface ServiceListFilters {
  categoryId?: string;
  providerId?: string;
  deliveryMode?: DeliveryMode;
  search?: string;
  maxPriceCents?: number;
}

export interface BookingListFilters {
  /** Which side of the booking the caller is on. */
  role: 'seeker' | 'provider';
  statuses?: readonly BookingStatus[];
  /** `upcoming` = starts in the future and not terminal. */
  window?: 'upcoming' | 'past';
}

export const qk = {
  /* --- profiles --------------------------------------------------------- */
  profiles: {
    all: ['profiles'] as const,
    detail: (profileId: string) => ['profiles', 'detail', profileId] as const,
    byHandle: (handle: string) => ['profiles', 'handle', handle] as const,
    me: ['profiles', 'me'] as const,
    deletionBlockers: ['profiles', 'me', 'deletion-blockers'] as const,
    blocked: ['profiles', 'me', 'blocked'] as const,
    providerDetails: (profileId: string) => ['profiles', 'provider-details', profileId] as const,
    specialities: (profileId: string) => ['profiles', 'specialities', profileId] as const,
    rating: (profileId: string) => ['profiles', 'rating', profileId] as const,
    reviews: (profileId: string) => ['profiles', 'reviews', profileId] as const,
    followers: (profileId: string) => ['profiles', 'followers', profileId] as const,
    following: (profileId: string) => ['profiles', 'following', profileId] as const,
  },

  /* --- catalog ---------------------------------------------------------- */
  categories: {
    all: ['categories'] as const,
    list: ['categories', 'list'] as const,
  },
  specialities: {
    all: ['specialities'] as const,
    list: ['specialities', 'list'] as const,
  },

  events: {
    all: ['events'] as const,
    list: (filters: EventListFilters = {}) => ['events', 'list', filters] as const,
    detail: (eventId: string) => ['events', 'detail', eventId] as const,
    bySlug: (slug: string) => ['events', 'slug', slug] as const,
    ticketTypes: (eventId: string) => ['events', 'ticket-types', eventId] as const,
    occurrences: (eventId: string) => ['events', 'occurrences', eventId] as const,
    images: (eventId: string) => ['events', 'images', eventId] as const,
    hosting: (hostId: string) => ['events', 'hosting', hostId] as const,
    /**
     * The Listings tab's flat, `updated_at`-ordered set.
     *
     * Deliberately NOT `hosting`. That key is consumed by `(provider)/events`
     * through `useInfiniteQuery`, which caches `{pages, pageParams}`; Listings
     * uses a plain `useQuery`, which caches a bare array. Sharing one key put
     * both shapes in one entry, and whichever screen was visited second threw
     * — `.pages` undefined on one side, `.map is not a function` on the other.
     */
    hostingRecent: (hostId: string) => ['events', 'hosting', hostId, 'recent'] as const,
    attendees: (eventId: string) => ['events', 'attendees', eventId] as const,
  },

  services: {
    all: ['services'] as const,
    list: (filters: ServiceListFilters = {}) => ['services', 'list', filters] as const,
    detail: (serviceId: string) => ['services', 'detail', serviceId] as const,
    byProvider: (providerId: string) => ['services', 'provider', providerId] as const,
    /**
     * The OWNER's list, which includes paused services. Deliberately a
     * different key from `byProvider` — sharing one would let a cached owner
     * result render paused services on the public profile.
     */
    ownedBy: (providerId: string) => ['services', 'provider', providerId, 'including-inactive'] as const,
    rules: (providerId: string) => ['services', 'rules', providerId] as const,
    blocks: (providerId: string) => ['services', 'blocks', providerId] as const,
    availability: (providerId: string, fromIso: string, toIso: string) =>
      ['services', 'availability', providerId, fromIso, toIso] as const,
  },

  /* --- commerce --------------------------------------------------------- */
  bookings: {
    all: ['bookings'] as const,
    list: (filters: BookingListFilters) => ['bookings', 'list', filters] as const,
    detail: (bookingId: string) => ['bookings', 'detail', bookingId] as const,
  },

  orders: {
    all: ['orders'] as const,
    list: ['orders', 'list'] as const,
    detail: (orderId: string) => ['orders', 'detail', orderId] as const,
    items: (orderId: string) => ['orders', 'items', orderId] as const,
  },

  tickets: {
    all: ['tickets'] as const,
    mine: ['tickets', 'mine'] as const,
    forEvent: (eventId: string) => ['tickets', 'event', eventId] as const,
    // Keyed by viewer for the same privacy reason as conversations below: this
    // list is "what am I personally still being asked", and a shared key would
    // hand one account's pending questions to the next one to sign in.
    pendingConsent: (viewerId: string) => ['tickets', viewerId, 'pending-consent'] as const,
    detail: (ticketId: string) => ['tickets', 'detail', ticketId] as const,
  },

  refunds: {
    all: ['refunds'] as const,
    mine: ['refunds', 'mine'] as const,
    detail: (refundId: string) => ['refunds', 'detail', refundId] as const,
  },

  /* --- social ----------------------------------------------------------- */
  saved: {
    all: ['saved'] as const,
    list: ['saved', 'list'] as const,
  },

  /*
   * Conversations and notifications are keyed BY VIEWER, and that is a privacy
   * boundary rather than a tidiness preference.
   *
   * Without the viewer id these keys are global: `['conversations', 'list']` is
   * the same cache entry for everybody. Isolation then rests entirely on
   * `queryClient.clear()` running on sign-out, and there are paths where it does
   * not — a sign-out that throws, or a session revoked server-side. When one of
   * those happens the next person to open Messages renders the previous
   * person's conversation titles, avatars and message previews before any fetch
   * returns. Clearing on sign-out is still done (AuthContext) but it is defence
   * in depth; this is the actual fix, because a key that contains the viewer
   * cannot collide in the first place.
   *
   * `all` stays a bare prefix so `invalidateQueries({ queryKey: all })` still
   * sweeps everything — the viewer id sits after it in the path.
   */
  conversations: {
    all: ['conversations'] as const,
    list: (viewerId: string) => ['conversations', viewerId, 'list'] as const,
    detail: (viewerId: string, conversationId: string) =>
      ['conversations', viewerId, 'detail', conversationId] as const,
    messages: (viewerId: string, conversationId: string) =>
      ['conversations', viewerId, 'messages', conversationId] as const,
    participants: (viewerId: string, conversationId: string) =>
      ['conversations', viewerId, 'participants', conversationId] as const,
    unreadCount: (viewerId: string) => ['conversations', viewerId, 'unread-count'] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    list: (viewerId: string) => ['notifications', viewerId, 'list'] as const,
    unreadCount: (viewerId: string) => ['notifications', viewerId, 'unread-count'] as const,
  },
} as const;
