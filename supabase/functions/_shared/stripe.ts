// =============================================================================
// Stripe
// =============================================================================
// Deno has no Node crypto, so Stripe's SDK needs both the fetch HTTP client and
// the SubtleCrypto provider. Signature verification must use the *async*
// constructEventAsync for the same reason.

import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";
import { requireEnv } from "./env.ts";
import { ApiError } from "./errors.ts";

let cached: Stripe | null = null;

export function stripeClient(): Stripe {
  if (cached) return cached;
  cached = new Stripe(
    requireEnv("STRIPE_SECRET_KEY", "create-checkout, book-service and process-refund all call the Stripe API."),
    {
      apiVersion: "2025-02-24.acacia",
      httpClient: Stripe.createFetchHttpClient(),
      appInfo: { name: "msn-edge-functions" },
    },
  );
  return cached;
}

/** SubtleCrypto-backed provider, required for webhook signature checks in Deno. */
export const cryptoProvider = Stripe.createSubtleCryptoProvider();

export { Stripe };

/**
 * Turns a Stripe SDK error into an ApiError that says something actionable.
 * Stripe's own messages are good; what they lack is the "so what do I do".
 */
export function translateStripeError(err: unknown): never {
  const e = err as { type?: string; code?: string; message?: string; statusCode?: number };
  if (!e?.type) throw err;

  const fixes: Record<string, string> = {
    StripeCardError: "Show the customer the decline message and let them try another card. The order stays `pending` and can be retried.",
    StripeInvalidRequestError: "This is a server-side bug, not a customer problem. Check the function logs for the parameter Stripe rejected.",
    StripeAPIError: "Stripe had a problem. Retry the request; the idempotency key makes a retry safe.",
    StripeConnectionError: "Network failure talking to Stripe. Retry; the idempotency key makes a retry safe.",
    StripeAuthenticationError: "STRIPE_SECRET_KEY is wrong or revoked. Re-set it with `supabase secrets set STRIPE_SECRET_KEY=...`.",
    StripeRateLimitError: "Back off and retry with a short delay.",
    StripeIdempotencyError: "The same idempotency key was reused with different parameters. This is a bug — do not retry blindly.",
  };

  throw new ApiError(
    e.statusCode && e.statusCode < 500 ? 402 : 502,
    `stripe_${e.code ?? e.type ?? "error"}`.toLowerCase(),
    e.message ?? "Stripe rejected the request.",
    fixes[e.type ?? ""] ?? "Check the Stripe dashboard logs for this request.",
  );
}
