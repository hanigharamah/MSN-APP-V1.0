// =============================================================================
// create-checkout
// =============================================================================
// Turns a ticket selection into a `pending` order and a Stripe PaymentIntent.
//
// The client sends *what* it wants, never *what it costs*. Every price in the
// resulting order is read out of `ticket_types` inside this function. A request
// body that contains a price field is ignored, not honoured.
//
// POST body:
//   {
//     "event_id":      "uuid",
//     "occurrence_id": "uuid|null",
//     "items":         [{ "ticket_type_id": "uuid", "quantity": 2 }],
//     "platform":      "ios"|"android"|"web"    // optional, drives the IAP guard
//   }
//
// Shorthand for a single ticket type is accepted:
//   { "event_id": "...", "ticket_type_id": "...", "quantity": 2 }
//
// 200:
//   {
//     "order_id", "reference", "status", "currency",
//     "amounts": { subtotal_cents, discount_cents, tax_cents,
//                  platform_fee_cents, total_cents },
//     "payment": { "provider": "stripe", "client_secret", "payment_intent_id",
//                  "publishable_key" }            // omitted for free orders
//   }

import { conflict, forbidden, json, notFound, readJson, serveJson, unprocessable } from "../_shared/errors.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { optionalEnum, optionalString, optionalUuid, requireArray, requireInt, requireUuid } from "../_shared/validate.ts";
import { assertChargeable, assertSameCurrency, computeTotals } from "../_shared/money.ts";
import { stripeClient, translateStripeError } from "../_shared/stripe.ts";
import { fulfilOrder } from "../_shared/fulfilment.ts";
import { paymentBypassEnabled } from "../_shared/env.ts";

interface RequestedItem {
  ticket_type_id: string;
  quantity: number;
}

const BUYABLE_EVENT_STATUSES = new Set(["published"]);

Deno.serve(serveJson(async (req) => {
  const caller = await requireUser(req);
  const admin = adminClient();
  const body = await readJson(req);

  // --------------------------------------------------------------- input
  const eventId = requireUuid(body.event_id, "event_id");
  const occurrenceId = optionalUuid(body.occurrence_id, "occurrence_id");
  const platform = optionalEnum(body.platform, "platform", ["ios", "android", "web"] as const, "web");
  // Unique per checkout ATTEMPT. A retried request reuses it and gets the
  // original order back instead of creating a second one — see migration 0016.
  const idempotencyKey = optionalString(body.idempotency_key, "idempotency_key", 128);

  let rawItems: unknown[];
  if (body.items !== undefined) {
    rawItems = requireArray(body.items, "items", { min: 1, max: 20 });
  } else if (body.ticket_type_id !== undefined) {
    rawItems = [{ ticket_type_id: body.ticket_type_id, quantity: body.quantity ?? 1 }];
  } else {
    throw unprocessable(
      "no_items",
      "The request selected no tickets.",
      'Send `items: [{ "ticket_type_id": "...", "quantity": 1 }]`, or the shorthand `ticket_type_id` + `quantity`.',
    );
  }

  const requested: RequestedItem[] = rawItems.map((raw, i) => {
    const item = raw as Record<string, unknown>;
    return {
      ticket_type_id: requireUuid(item.ticket_type_id, `items[${i}].ticket_type_id`),
      quantity: requireInt(item.quantity, `items[${i}].quantity`, { min: 1, max: 100 }),
    };
  });

  // Collapse duplicates so max_per_order cannot be dodged by repeating a line.
  const merged = new Map<string, number>();
  for (const item of requested) {
    merged.set(item.ticket_type_id, (merged.get(item.ticket_type_id) ?? 0) + item.quantity);
  }

  // --------------------------------------------------------------- event
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, host_id, title, status, delivery_mode, currency, is_free, starts_at, ends_at, capacity")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) {
    throw notFound("event_not_found", `No event with id ${eventId}.`, "Refresh the event list — it may have been deleted.");
  }
  if (!BUYABLE_EVENT_STATUSES.has(event.status)) {
    throw conflict(
      "event_not_on_sale",
      `"${event.title}" is ${event.status}, not published.`,
      event.status === "cancelled"
        ? "The host called this event off. Show the cancelled state and stop offering tickets."
        : "Only published events sell tickets. Re-read the event and hide the buy button.",
      { status: event.status },
    );
  }
  if (new Date(event.ends_at) <= new Date()) {
    throw conflict(
      "event_has_ended",
      `"${event.title}" ended at ${event.ends_at}.`,
      "Hide past events from the buy flow.",
    );
  }
  if (event.host_id === caller.userId) {
    throw forbidden(
      "A host cannot buy tickets to their own event.",
      "Hosts already have access. Hide the buy button when `event.host_id === session.user.id`.",
    );
  }

  // Apple guideline 3.1.3(d): one-to-many realtime must go through IAP on iOS.
  // 3.1.3(e): anything consumed outside the app must NOT. `delivery_mode` is
  // the column that decides — see the README's design notes.
  if (event.delivery_mode === "online_live" && platform !== "web") {
    throw forbidden(
      `"${event.title}" is a live-streamed one-to-many event, which Apple guideline 3.1.3(d) requires to be sold through in-app purchase on ${platform === "ios" ? "iOS" : "Android"}.`,
      "Open the store purchase sheet instead of this function, and record the resulting order with rail `apple_iap` / `google_play`.",
    );
  }

  if (occurrenceId) {
    const { data: occurrence } = await admin
      .from("event_occurrences")
      .select("id, is_cancelled, starts_at")
      .eq("id", occurrenceId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (!occurrence) {
      throw notFound(
        "occurrence_not_found",
        `Occurrence ${occurrenceId} does not belong to event ${eventId}.`,
        "Send an occurrence id from this event's `event_occurrences`, or omit the field for a single-date event.",
      );
    }
    if (occurrence.is_cancelled) {
      throw conflict("occurrence_cancelled", "That date has been cancelled.", "Offer the remaining dates.");
    }
    // A past date was purchasable: only `is_cancelled` was checked, so the
    // client was the sole guard and a stale selection sold a ticket to a date
    // that had already happened. Verified before this fix.
    if (new Date(occurrence.starts_at as string) <= new Date()) {
      throw conflict(
        "occurrence_has_passed",
        "That date has already taken place.",
        "Drop past occurrences from the picker and clear any selection that ages out while the screen is open.",
      );
    }
  }

  // --------------------------------------------------- ticket types + rules
  const { data: ticketTypes, error: ttError } = await admin
    .from("ticket_types")
    .select("id, event_id, name, price_cents, currency, quantity, quantity_sold, max_per_order, sales_start_at, sales_end_at, is_active")
    .eq("event_id", eventId)
    .in("id", [...merged.keys()]);
  if (ttError) throw ttError;

  const byId = new Map((ticketTypes ?? []).map((t) => [t.id as string, t]));
  const now = new Date();

  const lines: Array<{ ticket_type_id: string; quantity: number; unit_price_cents: number }> = [];

  for (const [ticketTypeId, quantity] of merged) {
    const tt = byId.get(ticketTypeId);
    if (!tt) {
      throw notFound(
        "ticket_type_not_found",
        `Ticket type ${ticketTypeId} does not belong to event "${event.title}".`,
        "Re-read the event's ticket types; the listing you rendered from is stale.",
      );
    }
    if (!tt.is_active) {
      throw conflict(
        "ticket_type_inactive",
        `"${tt.name}" is no longer on sale.`,
        "Re-read the ticket types and drop the inactive ones from the picker.",
        { ticket_type_id: ticketTypeId },
      );
    }
    if (tt.sales_start_at && new Date(tt.sales_start_at) > now) {
      throw conflict(
        "sales_not_open",
        `Sales for "${tt.name}" open at ${tt.sales_start_at}.`,
        "Show a countdown instead of a buy button until that instant.",
        { ticket_type_id: ticketTypeId, sales_start_at: tt.sales_start_at },
      );
    }
    if (tt.sales_end_at && new Date(tt.sales_end_at) <= now) {
      throw conflict(
        "sales_closed",
        `Sales for "${tt.name}" closed at ${tt.sales_end_at}.`,
        "Show the closed state. This ticket type cannot be bought any more.",
        { ticket_type_id: ticketTypeId, sales_end_at: tt.sales_end_at },
      );
    }
    if (quantity > tt.max_per_order) {
      throw conflict(
        "over_max_per_order",
        `"${tt.name}" allows at most ${tt.max_per_order} per order, but ${quantity} were requested.`,
        `Cap the stepper at ${tt.max_per_order}.`,
        { ticket_type_id: ticketTypeId, max_per_order: tt.max_per_order },
      );
    }

    const remaining = tt.quantity === null ? null : (tt.quantity as number) - (tt.quantity_sold as number);
    if (remaining !== null && quantity > remaining) {
      throw conflict(
        "insufficient_inventory",
        remaining <= 0
          ? `"${tt.name}" is sold out.`
          : `Only ${remaining} of "${tt.name}" remain, but ${quantity} were requested.`,
        remaining <= 0
          ? "Show the sold-out state."
          : `Reduce the quantity to ${remaining} or fewer, or offer another ticket type.`,
        { ticket_type_id: ticketTypeId, remaining: Math.max(0, remaining), requested: quantity },
      );
    }

    lines.push({ ticket_type_id: ticketTypeId, quantity, unit_price_cents: tt.price_cents as number });
  }

  // ---------------------------------------------------------------- money
  // Prices come from `ticket_types`, never from the request body.
  const currency = assertSameCurrency(
    lines.map((l) => byId.get(l.ticket_type_id)!.currency as string),
    `Event "${event.title}"`,
  );
  const subtotal = lines.reduce((sum, l) => sum + l.unit_price_cents * l.quantity, 0);
  const amounts = computeTotals(subtotal);
  assertChargeable(amounts.total_cents, currency);

  // ---------------------------------------------------------------- order
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      buyer_id: caller.userId,
      idempotency_key: idempotencyKey ?? null,
      event_id: eventId,
      occurrence_id: occurrenceId,
      status: "pending",
      // Free orders still have to name a rail — the column is NOT NULL and the
      // enum has no 'free' member. See "Schema gaps" in the README.
      rail: "stripe",
      currency,
      ...amounts,
    })
    .select("id, reference, status, currency")
    .single();
  if (orderError) {
    // 23505 on `orders_idempotency_key_uniq` means this attempt already created
    // an order — a retry after a lost response, which is the whole point of the
    // key. Hand back the original instead of charging twice.
    if ((orderError as { code?: string }).code === "23505" && idempotencyKey) {
      const { data: existing } = await admin
        .from("orders")
        .select("id, reference, status, currency, stripe_payment_intent_id")
        .eq("buyer_id", caller.userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing) {
        return json({
          order_id: existing.id,
          reference: existing.reference,
          status: existing.status,
          currency: existing.currency,
          amounts,
          idempotent_replay: true,
        }, 200);
      }
    }
    throw orderError;
  }

  const { error: itemsError } = await admin.from("order_items").insert(
    lines.map((l) => ({
      order_id: order.id,
      ticket_type_id: l.ticket_type_id,
      quantity: l.quantity,
      unit_price_cents: l.unit_price_cents,
    })),
  );
  if (itemsError) {
    // Compensate: an order with no items would be unfulfillable and would sit
    // in the buyer's history forever.
    await admin.from("orders").delete().eq("id", order.id);
    throw itemsError;
  }

  // ------------------------------------------------------- free short-path
  if (amounts.total_cents === 0) {
    const result = await fulfilOrder(admin, order.id, { source: "create-checkout:free" });
    return json({
      order_id: order.id,
      reference: order.reference,
      status: "paid",
      currency,
      amounts,
      free: true,
      tickets_created: result.tickets_created,
      payment: null,
    }, 201);
  }

  // ------------------------------------------------------- payment bypass
  // Testing shortcut: complete the order as paid without taking money. Self-
  // disables the moment STRIPE_SECRET_KEY exists — see paymentBypassEnabled().
  if (paymentBypassEnabled()) {
    await admin.from("orders").update({ payment_bypassed: true }).eq("id", order.id);
    const bypassed = await fulfilOrder(admin, order.id, { source: "create-checkout:bypass" });
    console.warn(
      `PAYMENT BYPASS: order ${order.reference} completed for ${amounts.total_cents} ${currency} with NO payment taken.`,
    );
    return json({
      order_id: order.id,
      reference: order.reference,
      status: "paid",
      currency,
      amounts,
      tickets_created: bypassed.tickets_created,
      payment: null,
      payment_bypassed: true,
      notice: "Test mode: no payment was taken. This order is not revenue.",
    }, 201);
  }

  // ---------------------------------------------------------------- stripe
  //
  // `stripeClient()` throws SYNCHRONOUSLY when STRIPE_SECRET_KEY is unset — it
  // does not return a rejected promise — so it escaped the `.catch()` below and
  // the order was never marked failed. Every tap of Confirm accreted another
  // orphan `pending` row in the buyer's history. Same defect existed in
  // book-service.
  let stripe: ReturnType<typeof stripeClient>;
  try {
    stripe = stripeClient();
  } catch (err) {
    await admin.from("orders").update({ status: "failed" }).eq("id", order.id).eq("status", "pending");
    throw err;
  }

  const intent = await stripe.paymentIntents
    .create(
      {
        amount: amounts.total_cents,
        currency: currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        metadata: {
          kind: "order",
          order_id: order.id,
          order_reference: order.reference,
          event_id: eventId,
          buyer_id: caller.userId,
          platform,
        },
        description: `MSN order ${order.reference} — ${event.title}`,
        receipt_email: caller.profile.email ?? undefined,
      },
      // The same order id can never produce two PaymentIntents, however many
      // times a flaky mobile connection retries this call.
      { idempotencyKey: `order:${order.id}` },
    )
    .catch(async (err) => {
      // Don't leave a phantom `pending` order in the buyer's history.
      await admin.from("orders").update({ status: "failed" }).eq("id", order.id).eq("status", "pending");
      return translateStripeError(err);
    });

  const { error: linkError } = await admin
    .from("orders")
    .update({ stripe_payment_intent_id: intent.id })
    .eq("id", order.id);
  if (linkError) throw linkError;

  return json({
    order_id: order.id,
    reference: order.reference,
    status: order.status,
    currency,
    amounts,
    free: false,
    payment: {
      provider: "stripe",
      client_secret: intent.client_secret,
      payment_intent_id: intent.id,
      publishable_key: Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? null,
    },
  }, 201);
}));
