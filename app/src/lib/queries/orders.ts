import { supabase } from '@/lib/supabase';
import { createCheckout } from './functions';
import type {
  EventRow,
  Order,
  OrderItem,
  PaymentRail,
  RefundRequest,
  RefundRequestInsert,
  Ticket,
  TicketType,
} from '@/types/database';
import { isStoreRail } from '@/types/database';
import { rangeFor, unwrap, unwrapMaybe } from './client';

/**
 * Orders, tickets and refunds — buying entry to an event.
 *
 * RLS shape worth internalising: buyers may INSERT and SELECT their own
 * orders, and that is all. Every status transition happens in an Edge Function
 * with the service-role key. A client `update` on `orders` does not error, it
 * matches zero rows — so never rely on one.
 */

export type OrderWithEvent = Order & {
  event: Pick<EventRow, 'id' | 'title' | 'cover_url' | 'starts_at' | 'timezone' | 'status'> | null;
};

export type OrderItemWithTicketType = OrderItem & {
  ticket_type: Pick<TicketType, 'id' | 'name' | 'description'> | null;
};

export type TicketWithEvent = Ticket & {
  event: Pick<
    EventRow,
    'id' | 'title' | 'cover_url' | 'starts_at' | 'ends_at' | 'timezone' | 'venue_name' | 'status'
  > | null;
};

// -----------------------------------------------------------------------------
// Read
// -----------------------------------------------------------------------------

export async function listOrders(buyerId: string, page = 0): Promise<OrderWithEvent[]> {
  const [from, to] = rangeFor(page);
  return unwrap(
    supabase
      .from('orders')
      .select('*, event:events(id, title, cover_url, starts_at, timezone, status)')
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<OrderWithEvent[]>(),
    'load your orders',
  );
}

export async function getOrder(orderId: string): Promise<OrderWithEvent | null> {
  return unwrapMaybe(
    supabase
      .from('orders')
      .select('*, event:events(id, title, cover_url, starts_at, timezone, status)')
      .eq('id', orderId)
      .maybeSingle()
      .returns<OrderWithEvent | null>(),
    'load that order',
  );
}

export async function listOrderItems(orderId: string): Promise<OrderItemWithTicketType[]> {
  return unwrap(
    supabase
      .from('order_items')
      .select('*, ticket_type:ticket_types(id, name, description)')
      .eq('order_id', orderId)
      .returns<OrderItemWithTicketType[]>(),
    'load that order',
  );
}

/** The signed-in user's tickets. `code` is what the QR encodes. */
export async function listMyTickets(holderId: string, page = 0): Promise<TicketWithEvent[]> {
  const [from, to] = rangeFor(page);
  return unwrap(
    supabase
      .from('tickets')
      .select(
        '*, event:events(id, title, cover_url, starts_at, ends_at, timezone, venue_name, status)',
      )
      .eq('holder_id', holderId)
      .eq('is_void', false)
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<TicketWithEvent[]>(),
    'load your tickets',
  );
}

/**
 * The people coming, with their faces.
 *
 * `listEventTickets` below returns bare ticket rows, which is right for a
 * count but useless for the welcome card — that card is faces first, and a
 * ticket row has no name and no photograph on it.
 *
 * Ordered by first name, because the practitioner reads this as a room of
 * people rather than a list of purchases. Void tickets are excluded outright:
 * a cancelled ticket is not somebody to expect at the door.
 *
 * `holder_id` is nullable — a ticket can be bought for someone without an
 * account — so the profile may be absent and the card falls back to the
 * attendee name captured at checkout.
 */
export interface EventAttendee {
  id: string;
  checked_in_at: string | null;
  attendee_name: string | null;
  /** null = never answered. Not the same as "no", and never shown as one. */
  photo_consent: boolean | null;
  holder: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

export async function listEventAttendees(eventId: string): Promise<EventAttendee[]> {
  const rows = await unwrap(
    supabase
      .from('tickets')
      .select('id, checked_in_at, attendee_name, photo_consent, holder:profiles!tickets_holder_id_fkey(id, display_name, avatar_url)')
      .eq('event_id', eventId)
      .eq('is_void', false)
      .returns<EventAttendee[]>(),
    'load your seekers',
  );

  // Sorted in JS rather than SQL: the sort key is the holder's name when there
  // is one and the checkout name when there is not, which PostgREST cannot
  // order by across an embedded table.
  return [...rows].sort((a, b) =>
    attendeeLabel(a).localeCompare(attendeeLabel(b), undefined, { sensitivity: 'base' }),
  );
}

/** First name where we have one — this card never shows surnames. */
export function attendeeLabel(attendee: EventAttendee): string {
  const full = attendee.holder?.display_name ?? attendee.attendee_name ?? 'Guest';
  return full.trim().split(/\s+/)[0] ?? full;
}

/**
 * Mark somebody arrived, or undo it.
 *
 * A toggle rather than `checkInTicket`'s one-way stamp, because the card is
 * driven by tapping faces and a mis-tap has to be undoable — the alternative
 * is a practitioner stuck with a wrong record and no way back.
 *
 * `checked_in_by` is cleared on undo so the row does not keep claiming that
 * somebody checked them in.
 *
 * ## Idempotent in both directions
 *
 * Marking somebody here twice keeps the *first* arrival time rather than
 * sliding it forward, because `.is('checked_in_at', null)` means the second
 * write matches no row. That matters in the room: a double tap, a stale card on
 * a second device, or a retry after a flaky connection would otherwise rewrite
 * an arrival that already happened. Undo is naturally idempotent — clearing an
 * already-clear row lands in the same state.
 */
export async function setTicketArrived(
  ticketId: string,
  hostId: string,
  arrived: boolean,
): Promise<Ticket> {
  if (!arrived) {
    return unwrap(
      supabase
        .from('tickets')
        .update({ checked_in_at: null, checked_in_by: null })
        .eq('id', ticketId)
        .select('*')
        .single(),
      'undo that',
    );
  }

  const stamped = await unwrapMaybe(
    supabase
      .from('tickets')
      .update({ checked_in_at: new Date().toISOString(), checked_in_by: hostId })
      .eq('id', ticketId)
      .is('checked_in_at', null)
      .select('*')
      .maybeSingle(),
    'mark them here',
  );
  if (stamped) return stamped;

  // Nothing to update: they were already marked here. Return the row as it
  // stands, so the caller sees a success and the original time survives.
  return unwrap(
    supabase.from('tickets').select('*').eq('id', ticketId).single(),
    'mark them here',
  );
}

/** Attendee list for a host. RLS restricts this to the event's host. */
export async function listEventTickets(eventId: string, page = 0): Promise<Ticket[]> {
  const [from, to] = rangeFor(page);
  return unwrap(
    supabase
      .from('tickets')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .range(from, to),
    'load attendees',
  );
}

export async function listMyRefundRequests(requesterId: string): Promise<RefundRequest[]> {
  return unwrap(
    supabase
      .from('refund_requests')
      .select('*')
      .eq('requester_id', requesterId)
      .order('created_at', { ascending: false }),
    'load your refund requests',
  );
}

// -----------------------------------------------------------------------------
// Write
// -----------------------------------------------------------------------------

export interface CheckoutLine {
  ticketTypeId: string;
  quantity: number;
}

export interface CreateOrderInput {
  buyerId: string;
  eventId: string;
  occurrenceId?: string;
  lines: readonly CheckoutLine[];
  rail: PaymentRail;
}

/**
 * Creates an order and starts payment.
 *
 * Delegates to the `create-checkout` Edge Function — never a client insert.
 * The reasons are in the schema: `ticket_not_oversold` guards stock,
 * `orders_paid_has_timestamp` ties status to the webhook, and every price is
 * re-read from `ticket_types` server-side so a client cannot set its own total.
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  // Goes through the `create-checkout` Edge Function, never a client insert.
  // Prices and inventory are decided server-side; see functions.ts.
  const result = await createCheckout({
    eventId: input.eventId,
    occurrenceId: input.occurrenceId,
    lines: input.lines,
  });
  return unwrap(
    supabase.from('orders').select('*').eq('id', result.order_id).single(),
    'load your order',
  );
}

/**
 * Same call, but returns the payment intent the checkout screen needs to
 * confirm with Stripe. Use this from the UI; `createOrder` is the convenience
 * wrapper for callers that only want the row.
 */
export { createCheckout } from './functions';
export type { CheckoutResponse, CheckoutAmounts } from './functions';

/**
 * Opens a refund request. This is the one commerce write a client may do —
 * `requesters open refunds` allows the INSERT, and admins decide.
 *
 * Exactly one of `orderId` / `bookingId` must be set
 * (`refund_targets_one_thing`).
 *
 * Check `canRequestRefund` first: Apple and Google purchases are refundable
 * only by the store, and opening a request we cannot fulfil is worse than
 * telling the customer where to go.
 */
export async function createRefundRequest(input: {
  requesterId: string;
  orderId?: string;
  bookingId?: string;
  reason: string;
  amountCents?: number;
}): Promise<RefundRequest> {
  const payload: RefundRequestInsert = {
    requester_id: input.requesterId,
    reason: input.reason,
    order_id: input.orderId ?? null,
    booking_id: input.bookingId ?? null,
    amount_cents: input.amountCents ?? null,
  };
  return unwrap(
    supabase.from('refund_requests').insert(payload).select('*').single(),
    'submit that refund request',
  );
}

export interface RefundRoute {
  /** Whether the platform can process this refund at all. */
  canRequestInApp: boolean;
  /** Copy to show the customer when it cannot. */
  message: string;
}

/**
 * Where a refund for this rail has to go.
 *
 * Recording `rail` per transaction is the whole reason this can be answered.
 * No policy wording lets us refund an Apple purchase.
 */
export function refundRouteFor(rail: PaymentRail): RefundRoute {
  if (isStoreRail(rail)) {
    const store = rail === 'apple_iap' ? 'Apple' : 'Google Play';
    return {
      canRequestInApp: false,
      message: `This purchase was made through ${store}, so only ${store} can refund it. Request a refund in your ${store} account.`,
    };
  }
  return { canRequestInApp: true, message: '' };
}

/** Door check-in. RLS restricts this UPDATE to the event's host. */
export async function checkInTicket(ticketId: string, hostId: string): Promise<Ticket> {
  return unwrap(
    supabase
      .from('tickets')
      .update({ checked_in_at: new Date().toISOString(), checked_in_by: hostId })
      .eq('id', ticketId)
      .select('*')
      .single(),
    'check in that ticket',
  );
}
