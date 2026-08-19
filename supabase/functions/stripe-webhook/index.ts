// =============================================================================
// stripe-webhook
// =============================================================================
// Stripe is the source of truth for whether money moved. Nothing else in this
// codebase marks an order paid.
//
// Two things this function must get right:
//
//   1. **Signature verification.** The raw body is verified against
//      STRIPE_WEBHOOK_SECRET before a single byte of it is trusted. Without
//      that, this endpoint is an unauthenticated "mark any order paid" API.
//      Deno has no Node crypto, so verification is async and uses the
//      SubtleCrypto provider.
//
//   2. **Idempotency.** Stripe retries. The same event id will arrive twice.
//      Ticket issuance is convergent rather than incremental — see the long
//      comment in _shared/fulfilment.ts. Delivering `payment_intent.succeeded`
//      a hundred times issues exactly the tickets the order paid for.
//
// DEPLOYMENT: this function must run with JWT verification OFF — Stripe does
// not send a Supabase token. Either add
//
//     [functions.stripe-webhook]
//     verify_jwt = false
//
// to supabase/config.toml, or deploy with
//
//     supabase functions deploy stripe-webhook --no-verify-jwt
//
// The Stripe signature is the authentication here, and it is stronger than a
// shared bearer token would be.

import { corsHeaders } from "../_shared/cors.ts";
import { requireEnv } from "../_shared/env.ts";
import { adminClient } from "../_shared/supabase.ts";
import { cryptoProvider, stripeClient } from "../_shared/stripe.ts";
import { failOrder, fulfilOrder } from "../_shared/fulfilment.ts";
import { deepLink, notifyUser } from "../_shared/notify.ts";

const HANDLED = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
]);

function ok(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return ok({ error: "Use POST." }, 405);

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return ok(
      {
        error: {
          code: "missing_signature",
          message: "No `stripe-signature` header on the request.",
          fix: "This endpoint only accepts calls from Stripe. Do not call it from the app.",
        },
      },
      400,
    );
  }

  // Must be the raw text. Parsing and re-serialising would break the HMAC.
  const rawBody = await req.text();

  let event;
  try {
    event = await stripeClient().webhooks.constructEventAsync(
      rawBody,
      signature,
      requireEnv("STRIPE_WEBHOOK_SECRET", "the webhook signature cannot be verified without it, and an unverified webhook is an open door."),
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("webhook signature verification failed:", message);
    return ok(
      {
        error: {
          code: "invalid_signature",
          message: `Signature verification failed: ${message}`,
          fix: "Check that STRIPE_WEBHOOK_SECRET matches the signing secret of *this* endpoint in the Stripe dashboard. Each endpoint has its own, and test and live mode differ.",
        },
      },
      400,
    );
  }

  if (!HANDLED.has(event.type)) {
    // 200, not 4xx: an unhandled type is not an error, and a non-2xx would put
    // Stripe into a retry loop over an event we will never want.
    return ok({ received: true, handled: false, type: event.type });
  }

  const admin = adminClient();
  const intent = event.data.object as {
    id: string;
    amount: number;
    currency: string;
    metadata?: Record<string, string>;
    last_payment_error?: { message?: string; code?: string } | null;
  };
  const kind = intent.metadata?.kind ?? "order";

  try {
    // ------------------------------------------------------------ bookings
    if (kind === "booking") {
      const bookingId = intent.metadata?.booking_id;
      if (!bookingId) {
        console.error(`booking payment intent ${intent.id} carries no booking_id metadata`);
        return ok({ received: true, handled: false, reason: "missing booking_id metadata" });
      }
      const result = event.type === "payment_intent.succeeded"
        ? await confirmBookingPayment(admin, bookingId, intent.id)
        : await failBookingPayment(admin, bookingId, intent.last_payment_error?.message ?? "The card was declined.");
      return ok({ received: true, handled: true, type: event.type, ...result });
    }

    // -------------------------------------------------------------- orders
    // Prefer the intent id (unique-indexed on orders) and fall back to
    // metadata, which covers an order whose PI link write did not land.
    let orderId = intent.metadata?.order_id ?? null;
    if (!orderId) {
      const { data } = await admin
        .from("orders")
        .select("id")
        .eq("stripe_payment_intent_id", intent.id)
        .maybeSingle();
      orderId = data?.id ?? null;
    }
    if (!orderId) {
      console.error(`no order found for payment intent ${intent.id}`);
      // 200 so Stripe stops retrying something we cannot resolve; the log line
      // is the alert.
      return ok({ received: true, handled: false, reason: "no matching order" });
    }

    if (event.type === "payment_intent.succeeded") {
      const result = await fulfilOrder(admin, orderId, { paymentIntentId: intent.id, source: `webhook:${event.id}` });
      console.log(
        `event ${event.id} -> order ${result.reference}: ${result.tickets_created} ticket(s) issued` +
          (result.already_fulfilled ? " (redelivery, no-op)" : ""),
      );
      return ok({ received: true, handled: true, type: event.type, ...result });
    }

    const changed = await failOrder(
      admin,
      orderId,
      intent.last_payment_error?.message ?? "The payment was declined.",
    );
    return ok({ received: true, handled: true, type: event.type, order_id: orderId, changed });
  } catch (err) {
    // A 5xx makes Stripe retry, which is what we want for a transient database
    // failure — the handlers are safe to run again.
    console.error(`webhook ${event.id} (${event.type}) failed:`, err);
    return ok(
      {
        error: {
          code: "handler_failed",
          message: err instanceof Error ? err.message : String(err),
          fix: "Stripe will retry this event. Fix the underlying error; the handlers are idempotent so the retry will settle correctly.",
        },
        event_id: event.id,
      },
      500,
    );
  }
});

async function confirmBookingPayment(admin: ReturnType<typeof adminClient>, bookingId: string, intentId: string) {
  const { data: booking, error } = await admin
    .from("bookings")
    .select("id, reference, status, seeker_id, provider_id, service_id, starts_at, timezone")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!booking) {
    console.error(`payment intent ${intentId} references missing booking ${bookingId}`);
    return { handled: false, reason: "booking not found" };
  }

  const { error: linkError } = await admin
    .from("bookings")
    .update({ stripe_payment_intent_id: intentId })
    .eq("id", bookingId)
    .is("stripe_payment_intent_id", null);
  if (linkError) throw linkError;

  // A service with requires_approval stays `requested` until the provider acts;
  // paying does not confirm it. Only an unapproved-flow booking auto-confirms,
  // and book-service already set it to `confirmed` in that case.
  await notifyUser(admin, {
    profileId: booking.provider_id as string,
    kind: booking.status === "requested" ? "booking_requested" : "booking_confirmed",
    title: booking.status === "requested" ? "New booking request" : "New booking",
    body: `Booking ${booking.reference} for ${new Date(booking.starts_at as string).toISOString()}.`,
    deepLink: deepLink(`booking/${bookingId}`),
    payload: { booking_id: bookingId },
    dedupeKey: `booking_paid:${bookingId}`,
  });

  await notifyUser(admin, {
    profileId: booking.seeker_id as string,
    kind: "booking_payment_received",
    title: "Payment received",
    body: booking.status === "requested"
      ? `Booking ${booking.reference} is with the practitioner for approval.`
      : `Booking ${booking.reference} is confirmed.`,
    deepLink: deepLink(`booking/${bookingId}`),
    payload: { booking_id: bookingId },
    dedupeKey: `booking_payment_received:${bookingId}`,
  });

  return { booking_id: bookingId, status: booking.status };
}

async function failBookingPayment(admin: ReturnType<typeof adminClient>, bookingId: string, reason: string) {
  // Only a booking that has not yet been acted on gets torn down. A provider
  // who already confirmed should not have it vanish underneath them.
  const { data, error } = await admin
    .from("bookings")
    .update({ status: "cancelled_by_seeker", cancelled_at: new Date().toISOString() })
    .eq("id", bookingId)
    .in("status", ["requested", "confirmed"])
    .select("id, reference, seeker_id");
  if (error) throw error;
  if (!data || data.length === 0) return { booking_id: bookingId, changed: false };

  await notifyUser(admin, {
    profileId: data[0].seeker_id as string,
    kind: "booking_payment_failed",
    title: "Payment didn't go through",
    body: `${reason} Booking ${data[0].reference} was released — the slot is open again.`,
    deepLink: deepLink(`booking/${bookingId}`),
    payload: { booking_id: bookingId },
    dedupeKey: `booking_payment_failed:${bookingId}`,
  });
  return { booking_id: bookingId, changed: true };
}
