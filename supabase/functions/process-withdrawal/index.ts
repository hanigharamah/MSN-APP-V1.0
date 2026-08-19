// =============================================================================
// process-withdrawal
// =============================================================================
// Admin-only. Approves or rejects a practitioner's withdrawal request, and on
// approval moves the money to their connected account.
//
// ## The order of operations matters
//
// Stripe first, database second. A transfer that succeeded while the row still
// says `pending` can be reconciled — the transfer id is on the Stripe side and
// an operator can find it. A row marked `approved` for a transfer that never
// happened is a practitioner who believes they have been paid and has not been,
// which is the failure that costs trust.
//
// ## Why this is not idempotent by retry
//
// The request is moved out of `pending` only after the transfer returns, and
// the function refuses anything not currently `pending`. So a double-tap on
// Approve cannot send two transfers: the second call finds a decided row and
// stops. That is the guard, rather than an idempotency key, because the unit of
// work here is a human decision and there is exactly one of them.
//
// POST body:
//   { "withdrawal_request_id": "uuid", "decision": "approve" | "reject",
//     "admin_note": "..." }              // required on reject

import { conflict, json, notFound, readJson, serveJson, unprocessable } from "../_shared/errors.ts";
import { adminClient, requireAdmin } from "../_shared/supabase.ts";
import { optionalString, requireEnum, requireUuid } from "../_shared/validate.ts";
import { stripeClient, translateStripeError } from "../_shared/stripe.ts";
import { deepLink, notifyUser } from "../_shared/notify.ts";
import { formatMoney } from "../_shared/money.ts";

Deno.serve(serveJson(async (req: Request) => {
  const caller = await requireAdmin(req);
  const body = await readJson(req);

  const requestId = requireUuid(body, "withdrawal_request_id");
  const decision = requireEnum(body, "decision", ["approve", "reject"] as const);
  const note = optionalString(body, "admin_note");

  if (decision === "reject" && !note) {
    throw unprocessable(
      "withdrawal_note_required",
      "A rejected withdrawal needs a note.",
      "The practitioner sees this. Rejecting without a reason leaves them with no way to fix it.",
    );
  }

  const admin = adminClient();

  const { data: request } = await admin
    .from("withdrawal_requests")
    .select("id, provider_id, amount_cents, currency, status")
    .eq("id", requestId)
    .maybeSingle();

  if (!request) throw notFound("withdrawal_not_found", "That withdrawal request does not exist.");
  if (request.status !== "pending") {
    throw conflict(
      "withdrawal_already_decided",
      `This request has already been ${request.status}.`,
      "Reload the queue — somebody else may have decided it.",
    );
  }

  if (decision === "reject") {
    const { error } = await admin
      .from("withdrawal_requests")
      .update({
        status: "rejected",
        admin_note: note,
        decided_at: new Date().toISOString(),
        decided_by: caller.profile.id,
      })
      .eq("id", requestId)
      .eq("status", "pending");
    if (error) throw error;

    await notifyUser(admin, {
      profileId: request.provider_id,
      kind: "withdrawal_rejected",
      title: "Your withdrawal was not approved",
      body: note ?? undefined,
      deepLink: deepLink("payouts"),
    });

    return json({ status: "rejected" });
  }

  const { data: details } = await admin
    .from("provider_details")
    .select("stripe_account_id, stripe_payouts_enabled")
    .eq("profile_id", request.provider_id)
    .maybeSingle();

  if (!details?.stripe_account_id) {
    throw unprocessable(
      "no_connected_account",
      "This practitioner has no connected Stripe account.",
      "They need to finish payout onboarding before a transfer can be sent.",
    );
  }

  const stripe = stripeClient();
  let transferId: string;

  try {
    const transfer = await stripe.transfers.create({
      amount: request.amount_cents,
      currency: request.currency.toLowerCase(),
      destination: details.stripe_account_id,
      description: `MSN withdrawal ${request.id}`,
      metadata: { withdrawal_request_id: request.id, provider_id: request.provider_id },
    });
    transferId = transfer.id;
  } catch (err) {
    // The money did not move, so the request stays claimable. `failed` rather
    // than back to `pending`: an operator needs to see that it was tried.
    await admin
      .from("withdrawal_requests")
      .update({
        status: "failed",
        admin_note: err instanceof Error ? err.message : "Transfer failed.",
        decided_at: new Date().toISOString(),
        decided_by: caller.profile.id,
      })
      .eq("id", requestId)
      .eq("status", "pending");

    translateStripeError(err);
  }

  const { error } = await admin
    .from("withdrawal_requests")
    .update({
      status: "approved",
      admin_note: note,
      stripe_transfer_id: transferId!,
      decided_at: new Date().toISOString(),
      decided_by: caller.profile.id,
    })
    .eq("id", requestId)
    .eq("status", "pending");
  if (error) throw error;

  await notifyUser(admin, {
    profileId: request.provider_id,
    kind: "withdrawal_approved",
    title: "Your withdrawal is on its way",
    body: `${formatMoney(request.amount_cents, request.currency)} is being paid to your bank.`,
    deepLink: deepLink("payouts"),
  });

  return json({ status: "approved", transfer_id: transferId! });
}));
