// =============================================================================
// process-refund
// =============================================================================
// Admin-only. Approves or declines a refund request and moves the money.
//
// ## Refunds are cash, always
//
// **§7.2 — where the failure is ours, the remedy is money.** There is no
// alternative remedy to refuse: every approved refund returns cash to the
// original payment method, so the rule is satisfied structurally rather than by
// a guard. `cause` is still recorded — it goes onto the Stripe refund metadata
// and belongs in an audit trail — but it no longer gates anything.
//
// **§5.3 — a cash refund to the original payment method is always available.**
// That is now the only thing this function does.
//
// POST body:
//   {
//     "refund_request_id": "uuid",
//     "decision":     "approve" | "decline",
//     "amount_cents": 1500,                           // approve only, default = claimed
//     "cause":        "platform"|"provider"|"customer"|"force_majeure"|"unknown",
//     "decision_note": "...",                         // required on decline (§4.3)
//     "cancel_booking": "seeker" | "provider"         // optional, bookings only
//   }

import { conflict, json, notFound, readJson, serveJson, unprocessable } from "../_shared/errors.ts";
import { adminClient, requireAdmin } from "../_shared/supabase.ts";
import { optionalEnum, optionalString, requireEnum, requireInt, requireUuid } from "../_shared/validate.ts";
import { formatMoney } from "../_shared/money.ts";
import { stripeClient, translateStripeError } from "../_shared/stripe.ts";
import { deepLink, notifyUser } from "../_shared/notify.ts";

const CAUSES = ["platform", "provider", "customer", "force_majeure", "unknown"] as const;

Deno.serve(serveJson(async (req) => {
  const caller = await requireAdmin(req);
  const admin = adminClient();
  const body = await readJson(req);

  const refundId = requireUuid(body.refund_request_id, "refund_request_id");
  const decision = requireEnum(body.decision, "decision", ["approve", "decline"] as const);
  const cause = optionalEnum(body.cause, "cause", CAUSES, "unknown");
  const decisionNote = optionalString(body.decision_note, "decision_note", 2000);
  const cancelBooking = body.cancel_booking === undefined || body.cancel_booking === null || body.cancel_booking === ""
    ? null
    : requireEnum(body.cancel_booking, "cancel_booking", ["seeker", "provider"] as const);

  // Policy §4.3: a declined request must carry a written reason.
  if (decision === "decline" && !decisionNote) {
    throw unprocessable(
      "decision_note_required",
      "A declined refund must state the reason in writing.",
      "Send `decision_note` explaining why, and how the customer can escalate. Policy §4.3 requires it and the customer will be shown this text verbatim.",
    );
  }

  // ------------------------------------------------------------- load
  const { data: refund, error: refundError } = await admin
    .from("refund_requests")
    .select("id, requester_id, order_id, booking_id, status, reason, amount_cents, decided_at, processed_at")
    .eq("id", refundId)
    .maybeSingle();
  if (refundError) throw refundError;
  if (!refund) {
    throw notFound("refund_request_not_found", `No refund request with id ${refundId}.`, "Refresh the admin queue.");
  }
  if (refund.status === "processed" || refund.status === "declined") {
    throw conflict(
      "refund_already_decided",
      `Refund request ${refundId} is already ${refund.status} (decided ${refund.decided_at}).`,
      "Reload the queue. Re-deciding a settled request would double-refund the customer.",
      { status: refund.status },
    );
  }

  const isOrder = refund.order_id !== null;
  let rail: string;
  let currency: string;
  let paidCents: number;
  let paymentIntentId: string | null;
  let counterpartyId: string | null = null;
  let subjectLabel: string;

  if (isOrder) {
    const { data: order, error } = await admin
      .from("orders")
      .select("id, reference, buyer_id, event_id, status, rail, currency, total_cents, stripe_payment_intent_id, events(host_id, title)")
      .eq("id", refund.order_id!)
      .single();
    if (error) throw error;
    rail = order.rail as string;
    currency = order.currency as string;
    paidCents = order.total_cents as number;
    paymentIntentId = order.stripe_payment_intent_id as string | null;
    const eventRow = (order.events ?? {}) as Record<string, unknown>;
    counterpartyId = (eventRow.host_id as string | undefined) ?? null;
    subjectLabel = `order ${order.reference}`;
    if (order.status === "refunded") {
      throw conflict(
        "already_refunded",
        `Order ${order.reference} is already fully refunded.`,
        "Close the request as processed manually — the money has already moved.",
      );
    }
  } else {
    const { data: booking, error } = await admin
      .from("bookings")
      .select("id, reference, seeker_id, provider_id, status, rail, currency, total_cents, stripe_payment_intent_id, services(title)")
      .eq("id", refund.booking_id!)
      .single();
    if (error) throw error;
    rail = booking.rail as string;
    currency = booking.currency as string;
    paidCents = booking.total_cents as number;
    paymentIntentId = booking.stripe_payment_intent_id as string | null;
    counterpartyId = booking.provider_id as string;
    subjectLabel = `booking ${booking.reference}`;
  }

  const nowIso = new Date().toISOString();

  // ------------------------------------------------------------ decline
  if (decision === "decline") {
    const { data: won, error } = await admin
      .from("refund_requests")
      .update({
        status: "declined",
        decision_note: decisionNote,
        decided_at: nowIso,
        decided_by: caller.userId,
      })
      .eq("id", refundId)
      .eq("status", "requested")
      .select("id");
    if (error) throw error;
    if (!won || won.length === 0) {
      throw conflict("refund_already_decided", "Another admin decided this request first.", "Reload the queue.");
    }

    await notifyUser(admin, {
      profileId: refund.requester_id as string,
      kind: "refund_declined",
      title: "About your refund request",
      body: decisionNote!,
      deepLink: deepLink(`refund/${refundId}`),
      payload: { refund_request_id: refundId, decision: "declined" },
      dedupeKey: `refund_declined:${refundId}`,
    });

    return json({
      refund_request_id: refundId,
      status: "declined",
      decision_note: decisionNote,
      decided_at: nowIso,
      // §4.3 requires we tell them how to escalate.
      escalation: "The customer can reply to this decision in the app to escalate it.",
    });
  }

  // Only APPROVAL is impossible for a store rail — MSN never received the
  // money. Declining must stay available, and the guard used to sit above the
  // decline branch, so the one action its own `fix` string recommends was the
  // one it blocked. An operator had no way to close these requests at all.
  if (rail === "apple_iap" || rail === "google_play") {
    throw conflict(
      "store_rail_not_refundable_by_msn",
      `${subjectLabel} was paid through ${rail === "apple_iap" ? "Apple" : "Google Play"}. MSN never received this money and cannot refund it.`,
      "Decline the request with a note directing the customer to the store. Only the store can issue this refund.",
      { rail },
    );
  }

  // ------------------------------------------------------------ approve
  const amountCents = body.amount_cents === undefined || body.amount_cents === null
    ? (refund.amount_cents as number | null) ?? paidCents
    : requireInt(body.amount_cents, "amount_cents", { min: 1, max: paidCents });

  if (amountCents > paidCents) {
    throw unprocessable(
      "refund_exceeds_payment",
      `Cannot refund ${formatMoney(amountCents, currency)} against ${subjectLabel}, which took ${formatMoney(paidCents, currency)}.`,
      `Lower \`amount_cents\` to ${paidCents} or less.`,
    );
  }

  const isPartial = amountCents < paidCents;
  let stripeRefundId: string | null = null;

  // ------------------------------------------------------------ the refund
  // `rail` can only be `stripe` here: apple_iap and google_play threw above,
  // and the enum has no other member. The guard stays as a tripwire in case
  // that stops being true.
  if (rail !== "stripe") {
    throw unprocessable(
      "unsupported_rail",
      `Rail "${rail}" has no refund route.`,
      "Every refundable row should carry rail `stripe`. Escalate to engineering — this is a data problem, not a customer problem.",
      { rail },
    );
  }

  if (!paymentIntentId) {
    throw unprocessable(
      "no_payment_intent",
      `${subjectLabel} has no \`stripe_payment_intent_id\`, so there is nothing for Stripe to refund against.`,
      "Find the charge in the Stripe dashboard, refund it there, then close this request manually. Also work out why the intent id was never written back — that is a bug in checkout.",
    );
  }

  const stripe = stripeClient();
  try {
    const refundResult = await stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount: amountCents,
        reason: "requested_by_customer",
        metadata: {
          refund_request_id: refundId,
          order_id: refund.order_id ?? "",
          booking_id: refund.booking_id ?? "",
          cause,
          decided_by: caller.userId,
        },
      },
      // A retry of this exact decision can never refund twice. A *different*
      // amount would need a different key, which is correct: that is a
      // different decision.
      { idempotencyKey: `refund:${refundId}:${amountCents}` },
    );
    stripeRefundId = refundResult.id;
  } catch (err) {
    translateStripeError(err);
  }

  // ------------------------------------------- settle the refund request
  const { data: settled, error: settleError } = await admin
    .from("refund_requests")
    .update({
      status: "processed",
      amount_cents: amountCents,
      decision_note: decisionNote,
      decided_at: nowIso,
      processed_at: nowIso,
      decided_by: caller.userId,
    })
    .eq("id", refundId)
    .in("status", ["requested", "approved"])
    .select("id");
  if (settleError) throw settleError;
  if (!settled || settled.length === 0) {
    // The money already moved, so this is a loud log rather than a rollback.
    console.error(`refund ${refundId} settled by another caller after money moved (stripe refund: ${stripeRefundId})`);
  }

  // ------------------------------------------------- reflect on the subject
  if (isOrder) {
    const { error } = await admin
      .from("orders")
      .update({ status: isPartial ? "partially_refunded" : "refunded" })
      .eq("id", refund.order_id!);
    if (error) throw error;
    // Note: issued `tickets` rows are left in place. Voiding them is a separate
    // decision (a partial refund should not void everything), and `is_void`
    // exists on the row for exactly that. See "Schema gaps" in the README.
  } else if (cancelBooking) {
    const { error } = await admin
      .from("bookings")
      .update({
        status: cancelBooking === "provider" ? "cancelled_by_provider" : "cancelled_by_seeker",
        cancelled_at: nowIso,
      })
      .eq("id", refund.booking_id!)
      .in("status", ["requested", "confirmed"]);
    if (error) throw error;
  }

  // --------------------------------------------------------------- notify
  const money = formatMoney(amountCents, currency);
  await notifyUser(admin, {
    profileId: refund.requester_id as string,
    kind: "refund_issued_cash",
    title: "Your refund is on its way",
    body: `${money} for ${subjectLabel}. It usually reaches your original payment method in 5–10 business days.`,
    deepLink: deepLink(`refund/${refundId}`),
    payload: {
      refund_request_id: refundId,
      amount_cents: amountCents,
      stripe_refund_id: stripeRefundId,
    },
    dedupeKey: `refund_processed:${refundId}`,
  });

  if (counterpartyId && counterpartyId !== refund.requester_id) {
    await notifyUser(admin, {
      profileId: counterpartyId,
      kind: "refund_processed_against_you",
      title: "A refund was issued",
      body: `${money} was refunded on ${subjectLabel}.`,
      deepLink: deepLink(`refund/${refundId}`),
      payload: { refund_request_id: refundId, amount_cents: amountCents },
      dedupeKey: `refund_processed_against_you:${refundId}`,
    });
  }

  return json({
    refund_request_id: refundId,
    status: "processed",
    cause,
    amount_cents: amountCents,
    amount_display: money,
    partial: isPartial,
    stripe_refund_id: stripeRefundId,
    subject: subjectLabel,
    processed_at: nowIso,
  });
}));
