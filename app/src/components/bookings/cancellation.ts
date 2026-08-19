import {
  formatCancellationWindow,
  formatEventTime,
  isWithinCancellationWindow,
  timeZoneSuffix,
} from '@/lib/format';
import { refundRouteFor } from '@/lib/queries/orders';
import { TERMINAL_BOOKING_STATUSES, type Booking, type BookingStatus } from '@/types/database';

/**
 * Turning `cancellation_window_hours` into something a person can act on.
 *
 * Two rules this file exists to enforce, both of them easy to get wrong:
 *
 * 1. **The window comes from the BOOKING, never from the service.** It is
 *    snapshotted at purchase time, and it is the term the seeker actually
 *    agreed to. The service may have been edited since; refund policy §2.3 says
 *    undisclosed terms are not binding. Everything here takes a booking.
 *
 * 2. **Cancelling does not move money.** `cancelBooking` sets a status. Whether
 *    anything comes back is a separate `requestRefund`, and on a store rail it
 *    is not ours to give at all. The copy below never implies otherwise —
 *    "free cancellation" describes the *policy*, not an automatic transfer.
 */

const MS_PER_HOUR = 3_600_000;

/** The part of a booking these calculations need. */
export type CancellableBooking = Pick<
  Booking,
  'starts_at' | 'ends_at' | 'timezone' | 'cancellation_window_hours' | 'rail' | 'status' | 'total_cents'
>;

export interface CancellationTerms {
  /** The snapshot from the booking row. Zero means there is no free window. */
  windowHours: number;
  /** When free cancellation stops. Equal to `starts_at` when the window is 0. */
  deadlineIso: string;
  /** True while the free window is still open. */
  isWithinWindow: boolean;
  /** The agreed policy — "Free cancellation up to 24 hours before". */
  policy: string;
  /** What happens if they cancel *right now*. The sentence users actually read. */
  consequence: string;
  /** False for `apple_iap` / `google_play` — only the store can refund those. */
  canRequestRefundInApp: boolean;
  /** Where to send them when we cannot refund. Empty when we can. */
  storeRefundMessage: string;
  /** Nothing was charged, so no refund conversation is needed at all. */
  isFree: boolean;
}

export function isTerminalBooking(status: BookingStatus): boolean {
  return (TERMINAL_BOOKING_STATUSES as readonly BookingStatus[]).includes(status);
}

/** True once the session's end time has passed. Cancelling stops making sense. */
export function hasEnded(booking: Pick<Booking, 'ends_at'>, now = Date.now()): boolean {
  return now >= new Date(booking.ends_at).getTime();
}

/** True once the session's start time has passed. */
export function hasStarted(booking: Pick<Booking, 'starts_at'>, now = Date.now()): boolean {
  return now >= new Date(booking.starts_at).getTime();
}

export function cancellationTermsFor(booking: CancellableBooking): CancellationTerms {
  const windowHours = booking.cancellation_window_hours;
  const deadlineIso = new Date(
    new Date(booking.starts_at).getTime() - windowHours * MS_PER_HOUR,
  ).toISOString();

  // Zero hours is not "cancel any time" — it is "no free cancellation at all",
  // and `isWithinCancellationWindow` would say true right up to the start.
  const isWithinWindow = windowHours > 0 && isWithinCancellationWindow(booking);

  const route = refundRouteFor(booking.rail);
  const isFree = booking.total_cents === 0;

  const suffix = timeZoneSuffix(booking.timezone, booking.starts_at);
  const deadlineLabel = `${formatEventTime(deadlineIso, booking.timezone)}${suffix ? ` ${suffix}` : ''}`;

  const consequence = isFree
    ? 'Nothing was charged for this booking, so cancelling costs you nothing.'
    : windowHours === 0
      ? 'This booking has no free cancellation window, so cancelling now is non-refundable.'
      : isWithinWindow
        ? // Deliberately not "Free cancellation until X" on its own. That line
          // is rendered large and green, and read alone it promises money back.
          // The window decides whether a refund is *due*; asking for it is a
          // separate step, which the sentence after this one says.
          `You are still inside the free-cancellation window. It closes ${deadlineLabel}.`
        : 'The free-cancellation window has passed. Cancelling now is non-refundable.';

  return {
    windowHours,
    deadlineIso,
    isWithinWindow,
    policy: formatCancellationWindow(windowHours),
    consequence,
    canRequestRefundInApp: route.canRequestInApp,
    storeRefundMessage: route.message,
    isFree,
  };
}

/**
 * The body of the confirmation alert shown before cancelling.
 *
 * Deliberately separates the two facts people conflate: the policy says whether
 * a refund is *due*, and a refund still has to be *asked for*.
 */
export function cancellationAlertMessage(
  terms: CancellationTerms,
  cancelledBy: 'seeker' | 'provider',
): string {
  if (cancelledBy === 'provider') {
    return [
      'The seeker will be told you cancelled, and the time slot is released.',
      'This changes the status only. Any money already taken has to be refunded separately.',
    ].join('\n\n');
  }

  const money = terms.isFree
    ? 'The time slot is released.'
    : terms.canRequestRefundInApp
      ? 'Cancelling releases the slot but does not move any money — you can request a refund afterwards.'
      : `Cancelling releases the slot but does not move any money. ${terms.storeRefundMessage}`;

  return `${terms.consequence}\n\n${money}`;
}
