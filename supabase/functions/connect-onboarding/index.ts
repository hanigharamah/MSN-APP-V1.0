// =============================================================================
// connect-onboarding
// =============================================================================
// Creates the practitioner's Stripe Connect account if they do not have one,
// and returns a one-time onboarding URL for them to complete it.
//
// ## Express, and why
//
// `type: "express"` — a lightweight dashboard Stripe hosts. Practitioners here
// are individuals and small studios, not businesses that want their own Stripe
// login. The alternative, a fully white-label flow, would mean building and
// maintaining identity collection, remediation and payout screens ourselves.
//
// Only the `transfers` capability is requested. This platform sends money TO
// connected accounts; it never charges customers on their behalf, because the
// checkout is ours. Asking for `card_payments` as well would make Stripe
// collect more information than the flow needs.
//
// ## The link is short-lived and single-use
//
// Account Links expire in minutes and cannot be reused, so the URL is generated
// per request and never stored. If somebody abandons onboarding halfway, they
// tap the button again and get a fresh one — which is also why `refresh_url`
// points back at the app rather than at a page that would need its own state.
//
// POST body: none. The caller is resolved from their JWT.

import { json, serveJson } from "../_shared/errors.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { stripeClient, translateStripeError } from "../_shared/stripe.ts";

// Account Links reject custom schemes — `msn://…` comes back as "Not a valid
// URL". These point at the `connect-return` function, which is a web page whose
// only job is to bounce the practitioner back into the app.
const FUNCTIONS_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
const RETURN_URL = `${FUNCTIONS_BASE}/connect-return?state=complete`;
const REFRESH_URL = `${FUNCTIONS_BASE}/connect-return?state=refresh`;

Deno.serve(serveJson(async (req: Request) => {
  const caller = await requireUser(req);
  const admin = adminClient();
  const stripe = stripeClient();

  const { data: details } = await admin
    .from("provider_details")
    .select("profile_id, stripe_account_id")
    .eq("profile_id", caller.profile.id)
    .maybeSingle();

  let accountId = details?.stripe_account_id ?? null;

  if (!accountId) {
    try {
      const account = await stripe.accounts.create({
        type: "express",
        email: caller.profile.email ?? undefined,
        capabilities: { transfers: { requested: true } },
        // `business_type` is deliberately NOT set. It is country-dependent —
        // "individual" is rejected outright in the UAE, where this platform is
        // registered — and Stripe's hosted onboarding asks the practitioner for
        // it anyway, in the form appropriate to wherever they are. Guessing it
        // here can only be wrong somewhere.
        metadata: { profile_id: caller.profile.id },
      });
      accountId = account.id;
    } catch (err) {
      translateStripeError(err);
    }

    // Written before the link is handed out. If the app never comes back, the
    // account still exists at Stripe — and an orphaned account we cannot find
    // again is worse than a row pointing at an unfinished one.
    const { error } = await admin
      .from("provider_details")
      .upsert(
        { profile_id: caller.profile.id, stripe_account_id: accountId },
        { onConflict: "profile_id" },
      );
    if (error) throw error;
  }

  try {
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: RETURN_URL,
      refresh_url: REFRESH_URL,
    });

    return json({ url: link.url, account_id: accountId });
  } catch (err) {
    translateStripeError(err);
  }
}));
