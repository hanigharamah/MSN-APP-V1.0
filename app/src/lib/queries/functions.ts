import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { AppError, type AppErrorKind } from '@/lib/errors';

/**
 * Calls to Supabase Edge Functions.
 *
 * Anything that moves money or holds inventory goes through here rather than a
 * client insert. The reasoning is in the schema itself: `ticket_not_oversold`,
 * `orders_paid_has_timestamp` and the booking overlap exclusion constraints all
 * describe invariants a client cannot uphold on its own.
 *
 * `supabase.functions.invoke` forwards the caller's session JWT, so the
 * function sees the real user and RLS still describes who they are.
 */

/**
 * The platform the Edge Functions use to decide whether Apple's IAP rules bite.
 *
 * Must be the real platform, not a constant. Apple guideline 3.1.3(d) requires
 * in-app purchase for one-to-many live events **on iOS only** — Android has no
 * equivalent restriction for services. Hard-coding `'ios'` would make
 * `create-checkout` refuse perfectly legal Android sales.
 */
export const CLIENT_PLATFORM: 'ios' | 'android' | 'web' =
  Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';

interface EdgeErrorBody {
  error?: { code?: string; message?: string; fix?: string };
  code?: string;
  message?: string;
}

/**
 * Maps an Edge Function's HTTP status onto the app's error taxonomy, so screens
 * can decide whether to offer "try again" without parsing strings.
 */
function kindForStatus(status: number): AppErrorKind {
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409 || status === 422 || status === 400) return 'validation';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unknown';
  return 'unknown';
}

/**
 * Invokes a function and turns a non-2xx into an `AppError` carrying the
 * function's own message, which is written to be shown to a person.
 */
async function invoke<T>(
  name: string,
  body: Record<string, unknown>,
  context: string,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });

  if (error) {
    // FunctionsHttpError keeps the response; anything else is transport.
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') {
      const parsed = (await response.json().catch(() => null)) as EdgeErrorBody | null;
      const detail = parsed?.error ?? parsed;
      if (detail?.message) {
        throw new AppError(kindForStatus(response.status), detail.message, {
          code: detail.code,
          cause: error,
        });
      }
    }
    throw new AppError('network', `Could not ${context}. Please try again.`, { cause: error });
  }

  if (data === null || data === undefined) {
    throw new AppError('unknown', `Could not ${context}. Please try again.`);
  }
  return data;
}

// -----------------------------------------------------------------------------
// Checkout
// -----------------------------------------------------------------------------

export interface CheckoutAmounts {
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  platform_fee_cents: number;
  total_cents: number;
}

export interface CheckoutResponse {
  order_id: string;
  reference: string;
  status: string;
  currency: string;
  amounts: CheckoutAmounts;
  /** Absent when the order is free and was fulfilled inline. */
  payment?: {
    provider: 'stripe';
    client_secret: string;
    payment_intent_id: string;
    publishable_key: string;
  };
}

/**
 * Creates a `pending` order and a PaymentIntent.
 *
 * Note what is NOT sent: prices. The function reads every price from
 * `ticket_types`, so a tampered client cannot set its own total.
 */
export async function createCheckout(input: {
  eventId: string;
  occurrenceId?: string;
  lines: readonly { ticketTypeId: string; quantity: number }[];
}): Promise<CheckoutResponse> {
  return invoke<CheckoutResponse>(
    'create-checkout',
    {
      event_id: input.eventId,
      occurrence_id: input.occurrenceId ?? null,
      items: input.lines.map((line) => ({
        ticket_type_id: line.ticketTypeId,
        quantity: line.quantity,
      })),
      platform: CLIENT_PLATFORM,
    },
    'start checkout',
  );
}

// -----------------------------------------------------------------------------
// Booking
// -----------------------------------------------------------------------------

export interface BookServiceResponse {
  booking_id: string;
  reference: string;
  status: string;
  starts_at: string;
  ends_at: string;
  currency: string;
  total_cents: number;
  payment?: {
    provider: 'stripe';
    client_secret: string;
    payment_intent_id: string;
    publishable_key: string;
  };
}

/**
 * Books a one-to-one service.
 *
 * `startsAt` must come from `getAvailableSlots`. The function re-checks the
 * slot against availability rules, blocks, other bookings and the seeker's own
 * calendar — the picker is a hint, this is the decision.
 */
export async function bookService(input: {
  serviceId: string;
  startsAt: string;
  timezone?: string;
  seekerNote?: string;
}): Promise<BookServiceResponse> {
  return invoke<BookServiceResponse>(
    'book-service',
    {
      service_id: input.serviceId,
      starts_at: input.startsAt,
      timezone: input.timezone,
      seeker_note: input.seekerNote,
      platform: CLIENT_PLATFORM,
    },
    'book that session',
  );
}

// -----------------------------------------------------------------------------
// Refunds
// -----------------------------------------------------------------------------

/**
 * Matches what `request-refund` actually returns.
 *
 * The previous shape declared `acknowledged_within` / `decision_within`, which
 * the function has never sent — so the success alert interpolated `undefined`
 * twice: "We will acknowledge this within undefined and decide within
 * undefined." Verified against the deployed function.
 */
export interface RequestRefundResponse {
  created: true;
  refund_request_id: string;
  status: string;
  rail: 'stripe';
  amount: { claimed_cents: number | null; currency: string; display: string };
  remedy_note: string;
  /** Null until an admin acknowledges it. */
  acknowledged_at: string | null;
  /** Human phrase, e.g. `'within 3 business days'` — not a timestamp. */
  decision_due: string;
  context?: unknown;
}

/**
 * The 409 body returned for an Apple or Google purchase. No refund row is
 * created — only the store can refund those, whatever a policy says.
 */
export interface StoreRefundRoute {
  rail: 'apple_iap' | 'google_play';
  message: string;
  instructions: string;
  url: string;
  amount: { total_cents: number; currency: string; display: string };
  subject: string;
}

/**
 * Opens a refund request.
 *
 * Apple and Google purchases short-circuit inside the function with a 409 and
 * the store's own URL — no row is created, because neither MSN nor the
 * practitioner can refund a store purchase whatever a policy says.
 */
export async function requestRefund(input: {
  orderId?: string;
  bookingId?: string;
  reason: string;
}): Promise<RequestRefundResponse> {
  return invoke<RequestRefundResponse>(
    'request-refund',
    { order_id: input.orderId, booking_id: input.bookingId, reason: input.reason },
    'request a refund',
  );
}
