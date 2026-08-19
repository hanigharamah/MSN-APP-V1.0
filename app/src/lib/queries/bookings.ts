import { supabase } from '@/lib/supabase';
import { bookService } from './functions';
import type {
  Booking,
  BookingStatus,
  DeliveryMode,
  PaymentRail,
  Profile,
  Service,
} from '@/types/database';
import { TERMINAL_BOOKING_STATUSES } from '@/types/database';
import type { BookingListFilters } from './keys';
import { rangeFor, unwrap, unwrapMaybe } from './client';

/**
 * Bookings — a seeker reserving one-to-one time with a provider.
 *
 * RLS gives both parties SELECT and UPDATE. The seeker inserts.
 */

export type BookingWithParties = Booking & {
  seeker: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'handle'> | null;
  provider: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'handle' | 'is_verified'> | null;
  service: Pick<
    Service,
    'id' | 'title' | 'duration_minutes' | 'delivery_mode' | 'cover_url'
  > | null;
};

const BOOKING_SELECT =
  '*, seeker:profiles!bookings_seeker_id_fkey(id, display_name, avatar_url, handle), provider:profiles!bookings_provider_id_fkey(id, display_name, avatar_url, handle, is_verified), service:services(id, title, duration_minutes, delivery_mode, cover_url)';

// -----------------------------------------------------------------------------
// Read
// -----------------------------------------------------------------------------

export async function listBookings(
  profileId: string,
  filters: BookingListFilters,
  page = 0,
): Promise<BookingWithParties[]> {
  const [from, to] = rangeFor(page);
  const column = filters.role === 'seeker' ? 'seeker_id' : 'provider_id';

  let query = supabase.from('bookings').select(BOOKING_SELECT).eq(column, profileId);

  if (filters.statuses && filters.statuses.length > 0) {
    query = query.in('status', filters.statuses);
  }

  const nowIso = new Date().toISOString();
  if (filters.window === 'upcoming') {
    query = query
      .gte('starts_at', nowIso)
      .not('status', 'in', `(${TERMINAL_BOOKING_STATUSES.join(',')})`);
  } else if (filters.window === 'past') {
    query = query.lt('starts_at', nowIso);
  }

  const ascending = filters.window === 'upcoming';

  return unwrap(
    query
      .order('starts_at', { ascending })
      .range(from, to)
      .returns<BookingWithParties[]>(),
    'load your bookings',
  );
}

export async function getBooking(bookingId: string): Promise<BookingWithParties | null> {
  return unwrapMaybe(
    supabase
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('id', bookingId)
      .maybeSingle()
      .returns<BookingWithParties | null>(),
    'load that booking',
  );
}

// -----------------------------------------------------------------------------
// Payment routing
// -----------------------------------------------------------------------------

/**
 * Which rail an offering must be paid on.
 *
 * Not a preference — Apple's guidelines make it a rule, and getting it wrong
 * is a rejected build:
 *
 *   `in_person`   consumed outside the app  -> external payment REQUIRED (3.1.3(e))
 *   `online_live` one-to-many realtime      -> IAP REQUIRED on iOS      (3.1.3(d))
 *   `one_to_one`  realtime, two people      -> external payment permitted
 *
 * Android has no equivalent restriction for services, so everything that is
 * not IAP-on-iOS goes through Stripe.
 */
export function railFor(deliveryMode: DeliveryMode, platform: 'ios' | 'android' | 'web'): PaymentRail {
  if (deliveryMode === 'online_live' && platform === 'ios') return 'apple_iap';
  return 'stripe';
}

// -----------------------------------------------------------------------------
// Write
// -----------------------------------------------------------------------------

export interface CreateBookingInput {
  seekerId: string;
  serviceId: string;
  /** UTC ISO. Must come from `getAvailableSlots`, not from a free-form picker. */
  startsAt: string;
  seekerNote?: string;
  rail: PaymentRail;
}

/**
 * Creates a booking and starts payment.
 *
 * Delegates to the `book-service` Edge Function. It validates the slot against
 * availability rules (in each rule's own timezone), blocks, other bookings
 * widened by `buffer_minutes`, and the seeker's own calendar — then snapshots
 * `cancellation_window_hours` so later edits to the service cannot change the
 * terms retroactively.
 */
export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  // Goes through the `book-service` Edge Function. It re-checks the slot
  // against availability rules, blocks, other bookings and the seeker's own
  // calendar, and snapshots `cancellation_window_hours` onto the row.
  const result = await bookService({
    serviceId: input.serviceId,
    startsAt: input.startsAt,
    seekerNote: input.seekerNote,
  });
  return unwrap(
    supabase.from('bookings').select('*').eq('id', result.booking_id).single(),
    'load your booking',
  );
}

export { bookService } from './functions';
export type { BookServiceResponse } from './functions';

/** Provider accepts a `requested` booking. */
export async function confirmBooking(bookingId: string): Promise<Booking> {
  return unwrap(
    supabase
      .from('bookings')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', bookingId)
      .select('*')
      .single(),
    'confirm that booking',
  );
}

export async function declineBooking(bookingId: string, providerNote?: string): Promise<Booking> {
  return unwrap(
    supabase
      .from('bookings')
      .update({
        status: 'declined',
        cancelled_at: new Date().toISOString(),
        ...(providerNote === undefined ? {} : { provider_note: providerNote }),
      })
      .eq('id', bookingId)
      .select('*')
      .single(),
    'decline that booking',
  );
}

/**
 * Cancel a booking.
 *
 * Sets the status only. Money is NOT moved here — whether a refund is due
 * depends on `cancellation_window_hours` (snapshotted on the booking) and on
 * `rail`, and store rails cannot be refunded by us at all. Call
 * `createRefundRequest` from `orders.ts` alongside this, or let the
 * cancellation Edge Function do both.
 */
export async function cancelBooking(
  bookingId: string,
  cancelledBy: 'seeker' | 'provider',
): Promise<Booking> {
  const status: BookingStatus =
    cancelledBy === 'seeker' ? 'cancelled_by_seeker' : 'cancelled_by_provider';
  return unwrap(
    supabase
      .from('bookings')
      .update({ status, cancelled_at: new Date().toISOString() })
      .eq('id', bookingId)
      .select('*')
      .single(),
    'cancel that booking',
  );
}

export async function markBookingCompleted(bookingId: string): Promise<Booking> {
  return unwrap(
    supabase.from('bookings').update({ status: 'completed' }).eq('id', bookingId).select('*').single(),
    'update that booking',
  );
}

export async function markBookingNoShow(bookingId: string): Promise<Booking> {
  return unwrap(
    supabase.from('bookings').update({ status: 'no_show' }).eq('id', bookingId).select('*').single(),
    'update that booking',
  );
}
