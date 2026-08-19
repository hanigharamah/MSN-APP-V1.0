// =============================================================================
// Order fulfilment
// =============================================================================
// Turning a paid order into tickets. Called by stripe-webhook on
// payment_intent.succeeded, and directly by create-checkout for zero-cost
// orders that never touch Stripe.
//
// ## Idempotency
//
// Stripe will deliver the same event twice. It is not an edge case, it is the
// documented contract. The schema gives us no `processed_events` table to
// dedupe against, so idempotency is derived from state that already exists:
//
//   1. The order status moves pending -> paid with a compare-and-swap. Only one
//      caller can win that.
//   2. Ticket issuance is *convergent*, not incremental: for each order item we
//      count the tickets that exist and create only the shortfall. A second
//      delivery computes a shortfall of zero.
//   3. `quantity_sold` is raised by the number of tickets actually created in
//      this pass — zero on a redelivery.
//
// The result is that step 1 winning is not load-bearing. If the function dies
// after marking the order paid but before issuing tickets, the redelivery loses
// the CAS, falls through, and finishes the job. That is deliberate: the repair
// path and the happy path are the same code.

import type { Admin } from "./supabase.ts";
import { increaseQuantitySold } from "./inventory.ts";
import { deepLink, notifyUser } from "./notify.ts";

export interface FulfilResult {
  order_id: string;
  reference: string;
  already_fulfilled: boolean;
  tickets_created: number;
  oversold_ticket_types: string[];
}

export async function fulfilOrder(
  admin: Admin,
  orderId: string,
  opts: { paymentIntentId?: string | null; source: string },
): Promise<FulfilResult> {
  // ---------------------------------------------------------------- 1. CAS
  const paidPatch: Record<string, unknown> = {
    status: "paid",
    purchased_at: new Date().toISOString(),
  };
  if (opts.paymentIntentId) paidPatch.stripe_payment_intent_id = opts.paymentIntentId;

  const { data: won, error: casError } = await admin
    .from("orders")
    .update(paidPatch)
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id");
  if (casError) throw casError;

  const wonRace = (won?.length ?? 0) === 1;

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, reference, buyer_id, event_id, status, currency, total_cents, purchased_at")
    .eq("id", orderId)
    .single();
  if (orderError) throw orderError;

  // A refunded or cancelled order must never sprout tickets on a late webhook.
  if (order.status !== "paid") {
    console.warn(
      `fulfilOrder: order ${orderId} is "${order.status}", not "paid" — refusing to issue tickets (source: ${opts.source})`,
    );
    return {
      order_id: orderId,
      reference: order.reference,
      already_fulfilled: true,
      tickets_created: 0,
      oversold_ticket_types: [],
    };
  }

  // ------------------------------------------------- 2. Converge on tickets
  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("id, ticket_type_id, quantity, unit_price_cents")
    .eq("order_id", orderId);
  if (itemsError) throw itemsError;

  const { data: buyer } = await admin
    .from("profiles")
    .select("display_name, email")
    .eq("id", order.buyer_id)
    .maybeSingle();

  let created = 0;
  const oversold: string[] = [];

  for (const item of items ?? []) {
    const { count, error: countError } = await admin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("order_item_id", item.id);
    if (countError) throw countError;

    const shortfall = (item.quantity as number) - (count ?? 0);
    if (shortfall <= 0) continue;

    const rows = Array.from({ length: shortfall }, () => ({
      order_item_id: item.id,
      event_id: order.event_id,
      // Every ticket is held by the buyer until they reassign it. There is no
      // per-attendee column on order_items to carry names through checkout —
      // see "Schema gaps" in the README.
      holder_id: order.buyer_id,
      attendee_name: buyer?.display_name ?? null,
      attendee_email: buyer?.email ?? null,
    }));

    const { error: insertError } = await admin.from("tickets").insert(rows);
    if (insertError) throw insertError;
    created += shortfall;

    // Only ever count what this pass actually issued.
    const sold = await increaseQuantitySold(admin, item.ticket_type_id as string, shortfall, {
      allowOversell: true, // the money is already taken; refusing here helps nobody
    });
    if (sold.clamped) oversold.push(item.ticket_type_id as string);
  }

  // ------------------------------------------------------- 3. Tell someone
  if (created > 0 || wonRace) {
    const { data: event } = await admin
      .from("events")
      .select("id, title, host_id, starts_at")
      .eq("id", order.event_id)
      .maybeSingle();

    await notifyUser(admin, {
      profileId: order.buyer_id,
      kind: "order_paid",
      title: "Your tickets are confirmed",
      body: event?.title ? `You're going to ${event.title}. Order ${order.reference}.` : `Order ${order.reference} is confirmed.`,
      deepLink: deepLink(`order/${orderId}`),
      payload: { order_id: orderId, event_id: order.event_id, reference: order.reference },
      dedupeKey: `order_paid:${orderId}`,
    });

    if (event?.host_id) {
      await notifyUser(admin, {
        profileId: event.host_id,
        kind: "event_ticket_sold",
        title: "You sold tickets",
        body: `${created} ticket(s) for ${event.title}.`,
        deepLink: deepLink(`event/${order.event_id}/orders`),
        payload: { order_id: orderId, event_id: order.event_id, quantity: created },
        dedupeKey: `event_ticket_sold:${orderId}`,
      });
    }

    if (oversold.length > 0 && event?.host_id) {
      // Loud, because a clamp means the door will see more valid codes than the
      // capacity says exist.
      console.error(`OVERSOLD on order ${orderId}: ticket types ${oversold.join(", ")}`);
      await notifyUser(admin, {
        profileId: event.host_id,
        kind: "event_oversold",
        title: "Capacity exceeded",
        body: `A paid order pushed "${event.title}" past its ticket limit. Check the attendee list before the door opens.`,
        deepLink: deepLink(`event/${order.event_id}/orders`),
        payload: { order_id: orderId, ticket_type_ids: oversold },
        dedupeKey: `event_oversold:${orderId}`,
      });
    }
  }

  return {
    order_id: orderId,
    reference: order.reference,
    already_fulfilled: !wonRace,
    tickets_created: created,
    oversold_ticket_types: oversold,
  };
}

/** payment_intent.payment_failed — only a pending order may move to failed. */
export async function failOrder(admin: Admin, orderId: string, reason: string): Promise<boolean> {
  const { data, error } = await admin
    .from("orders")
    .update({ status: "failed" })
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id, reference, buyer_id, event_id");
  if (error) throw error;
  if (!data || data.length === 0) return false;

  const order = data[0];
  await notifyUser(admin, {
    profileId: order.buyer_id as string,
    kind: "order_failed",
    title: "Payment didn't go through",
    body: `${reason} Your tickets were not reserved — you can try again with another card.`,
    deepLink: deepLink(`event/${order.event_id}`),
    payload: { order_id: orderId, reference: order.reference },
    dedupeKey: `order_failed:${orderId}`,
  });
  return true;
}
