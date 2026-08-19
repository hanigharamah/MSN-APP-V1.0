// =============================================================================
// request-refund
// =============================================================================
// Opens a `refund_requests` row against an order or a booking.
//
// ## The store rail rule
//
// If the purchase moved on `apple_iap` or `google_play`, **no refund request is
// created**. Apple and Google are the merchant of record for those
// transactions; MSN cannot refund money it never received, and pretending
// otherwise produces a request nobody can action and a customer waiting three
// business days for an answer of "go and ask Apple".
//
// So the response is a 409 carrying the store, the URL, and the exact wording
// the client should show. This is why `orders.rail` and `bookings.rail` exist
// (0004_commerce.sql), and it is the gap Appendix A4 of the refund policy calls
// out as needed before launch.
//
// POST body:
//   {
//     "order_id":   "uuid",     // exactly one of order_id / booking_id
//     "booking_id": "uuid",
//     "reason":     "..."       // required, shown to the reviewing admin
//   }

import { conflict, forbidden, json, notFound, readJson, serveJson, unprocessable } from "../_shared/errors.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { optionalUuid, requireString } from "../_shared/validate.ts";
import { formatMoney } from "../_shared/money.ts";
import { deepLink, notifyUser } from "../_shared/notify.ts";
import { hoursBetween } from "../_shared/time.ts";

const STORE_RAILS: Record<string, { store: string; url: string; how: string }> = {
  apple_iap: {
    store: "Apple",
    url: "https://reportaproblem.apple.com",
    how: "Apple is the merchant for this purchase and only Apple can refund it. Open reportaproblem.apple.com, sign in with the Apple Account used to buy, and choose Request a refund.",
  },
  google_play: {
    store: "Google Play",
    url: "https://play.google.com/store/account/orderhistory",
    how: "Google is the merchant for this purchase and only Google can refund it. Open Play Store → Account → Order history, find the purchase, and choose Report a problem.",
  },
};

/** An order that can still be refunded. */
const REFUNDABLE_ORDER_STATUSES = new Set(["paid", "partially_refunded"]);
/** A booking that can still be refunded. */
const REFUNDABLE_BOOKING_STATUSES = new Set([
  "requested", "confirmed", "completed", "no_show",
  "cancelled_by_seeker", "cancelled_by_provider", "declined",
]);

Deno.serve(serveJson(async (req) => {
  const caller = await requireUser(req);
  const admin = adminClient();
  const body = await readJson(req);

  const orderId = optionalUuid(body.order_id, "order_id");
  const bookingId = optionalUuid(body.booking_id, "booking_id");
  const reason = requireString(body.reason, "reason", { min: 4, max: 2000 });

  if ((orderId === null) === (bookingId === null)) {
    throw unprocessable(
      "ambiguous_target",
      "A refund request must name exactly one of `order_id` or `booking_id`.",
      "Send `order_id` for an event ticket purchase, or `booking_id` for a one-to-one session. Never both.",
    );
  }

  // -------------------------------------------------------------- subject
  let rail: string;
  let currency: string;
  let paidCents: number;
  let subjectLabel: string;
  let counterpartyId: string | null = null;
  let context: Record<string, unknown> = {};

  if (orderId) {
    const { data: order, error } = await admin
      .from("orders")
      .select("id, reference, buyer_id, event_id, status, rail, currency, total_cents, purchased_at, events(title, host_id, starts_at, status)")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) {
      throw notFound("order_not_found", `No order with id ${orderId}.`, "Send an order id from the buyer's own order history.");
    }
    if (order.buyer_id !== caller.userId && !caller.profile.is_admin) {
      throw forbidden(
        "This order belongs to someone else.",
        "Only the buyer can open a refund request on an order. A host who wants to refund an attendee should use the admin console.",
      );
    }
    if (!REFUNDABLE_ORDER_STATUSES.has(order.status)) {
      throw conflict(
        "order_not_refundable",
        `Order ${order.reference} is ${order.status}.`,
        order.status === "refunded"
          ? "It has already been refunded in full. Show the refund on the receipt instead of the request button."
          : order.status === "pending"
          ? "The payment never completed, so there is nothing to refund. Cancel the order instead."
          : "Only paid or partially refunded orders can be refunded.",
        { status: order.status },
      );
    }

    const event = (order.events ?? {}) as Record<string, unknown>;
    rail = order.rail as string;
    currency = order.currency as string;
    paidCents = order.total_cents as number;
    subjectLabel = `order ${order.reference}`;
    counterpartyId = (event.host_id as string) ?? null;
    context = {
      kind: "order",
      event_title: event.title ?? null,
      event_status: event.status ?? null,
      event_starts_at: event.starts_at ?? null,
      purchased_at: order.purchased_at,
      // Policy §6.1: a cancelled event is an automatic full refund. Surfacing
      // it here means the reviewing admin does not have to go and look.
      host_cancelled: event.status === "cancelled",
    };
  } else {
    const { data: booking, error } = await admin
      .from("bookings")
      .select("id, reference, seeker_id, provider_id, service_id, status, rail, currency, total_cents, starts_at, cancellation_window_hours, services(title)")
      .eq("id", bookingId!)
      .maybeSingle();
    if (error) throw error;
    if (!booking) {
      throw notFound("booking_not_found", `No booking with id ${bookingId}.`, "Send a booking id from the seeker's own booking list.");
    }
    if (booking.seeker_id !== caller.userId && !caller.profile.is_admin) {
      throw forbidden(
        "This booking belongs to someone else.",
        "Only the seeker who booked can open a refund request. A provider who wants to refund should use the admin console.",
      );
    }
    if (!REFUNDABLE_BOOKING_STATUSES.has(booking.status)) {
      throw conflict(
        "booking_not_refundable",
        `Booking ${booking.reference} is ${booking.status}.`,
        "Only a booking that took payment can be refunded.",
        { status: booking.status },
      );
    }

    const startsAt = new Date(booking.starts_at as string);
    const hoursToStart = hoursBetween(new Date(), startsAt);
    const windowHours = booking.cancellation_window_hours as number;

    rail = booking.rail as string;
    currency = booking.currency as string;
    paidCents = booking.total_cents as number;
    subjectLabel = `booking ${booking.reference}`;
    counterpartyId = booking.provider_id as string;
    context = {
      kind: "booking",
      service_title: (booking.services as Record<string, unknown> | null)?.title ?? null,
      starts_at: booking.starts_at,
      booking_status: booking.status,
      // Snapshotted at booking time, not read from the service now — that is
      // the entire point of the column.
      cancellation_window_hours: windowHours,
      hours_until_start: Math.round(hoursToStart * 10) / 10,
      within_cancellation_window: hoursToStart >= windowHours,
      // Policy §3.1: provider cancellation is an automatic full refund.
      provider_cancelled: booking.status === "cancelled_by_provider",
    };
  }

  // ------------------------------------------------------- THE STORE RULE
  const store = STORE_RAILS[rail];
  if (store) {
    // Deliberately no insert. See the header comment.
    return json(
      {
        created: false,
        refundable_by: store.store.toLowerCase() === "apple" ? "apple" : "google_play",
        rail,
        message: `${store.store} processed this payment, so ${store.store} has to issue the refund. MSN cannot refund it.`,
        instructions: store.how,
        url: store.url,
        amount: { total_cents: paidCents, currency, display: formatMoney(paidCents, currency) },
        subject: subjectLabel,
      },
      409,
      { "X-MSN-Refund-Route": rail },
    );
  }

  // Store rails short-circuited above, so `stripe` is the only rail MSN can
  // refund. Anything else is bad data rather than a customer problem.
  if (rail !== "stripe") {
    throw unprocessable(
      "unsupported_rail",
      `Rail "${rail}" has no refund route.`,
      "Every row should carry a rail from the `payment_rail` enum: stripe, apple_iap or google_play. Escalate to engineering.",
      { rail },
    );
  }

  // ---------------------------------------------------------- duplicates
  const dupQuery = admin
    .from("refund_requests")
    .select("id, status, created_at")
    .in("status", ["requested", "approved"]);
  const { data: open, error: dupError } = orderId
    ? await dupQuery.eq("order_id", orderId)
    : await dupQuery.eq("booking_id", bookingId!);
  if (dupError) throw dupError;

  if (open && open.length > 0) {
    throw conflict(
      "refund_already_open",
      `A refund request for ${subjectLabel} is already open (${open[0].status}), raised ${open[0].created_at}.`,
      "Show the existing request and its status instead of the request form. MSN decides within 3 business days of the original request.",
      { refund_request_id: open[0].id, status: open[0].status },
    );
  }

  // --------------------------------------------------------------- insert
  const nowIso = new Date().toISOString();
  const { data: refund, error: insertError } = await admin
    .from("refund_requests")
    .insert({
      requester_id: caller.userId,
      order_id: orderId,
      booking_id: bookingId,
      status: "requested",
      reason,
      // The amount claimed. process-refund may approve less.
      amount_cents: paidCents,
      // Policy §4.2 promises acknowledgement within one business day. The app
      // acknowledges immediately, so stamp it now rather than leaving a clock
      // running against a promise already kept.
      acknowledged_at: nowIso,
    })
    .select("id, status, amount_cents, created_at, acknowledged_at")
    .single();
  if (insertError) throw insertError;

  // --------------------------------------------------------------- notify
  await notifyUser(admin, {
    profileId: caller.userId,
    kind: "refund_requested",
    title: "We've got your refund request",
    body: "We'll review it and come back to you within 3 business days.",
    deepLink: deepLink(`refund/${refund.id}`),
    payload: { refund_request_id: refund.id, order_id: orderId, booking_id: bookingId, ...context },
    dedupeKey: `refund_requested:${refund.id}`,
  });

  if (counterpartyId && counterpartyId !== caller.userId) {
    await notifyUser(admin, {
      profileId: counterpartyId,
      kind: "refund_requested_against_you",
      title: "A refund has been requested",
      body: `${caller.profile.display_name} raised a refund request on ${subjectLabel}. MSN will review it.`,
      deepLink: deepLink(`refund/${refund.id}`),
      payload: { refund_request_id: refund.id, order_id: orderId, booking_id: bookingId },
      dedupeKey: `refund_requested_against_you:${refund.id}`,
    });
  }

  return json({
    created: true,
    refund_request_id: refund.id,
    status: refund.status,
    rail,
    amount: { claimed_cents: refund.amount_cents, currency, display: formatMoney(paidCents, currency) },
    // Policy §5.3: a cash refund to the original payment method is always
    // available, and is now the only remedy MSN offers.
    remedy_note: "Any refund due is returned to your original payment method.",
    acknowledged_at: refund.acknowledged_at,
    decision_due: "within 3 business days",
    context,
  }, 201);
}));
