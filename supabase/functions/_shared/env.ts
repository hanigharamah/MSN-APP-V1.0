// =============================================================================
// Environment
// =============================================================================
// Every secret is read here and nowhere else. Nothing in this repo hardcodes a
// key. `requireEnv` fails loudly at the top of a request rather than producing
// a confusing downstream error.

import { ApiError } from "./errors.ts";

export function requireEnv(name: string, why: string): string {
  const v = Deno.env.get(name);
  if (!v || v.trim() === "") {
    throw new ApiError(
      500,
      "missing_configuration",
      `The ${name} secret is not set on this Edge Function.`,
      `Run \`supabase secrets set ${name}=...\`. Needed because: ${why}`,
    );
  }
  return v.trim();
}

export function envInt(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new ApiError(
      500,
      "invalid_configuration",
      `${name} must be a non-negative whole number, but is set to "${raw}".`,
      `Fix it with \`supabase secrets set ${name}=<integer>\`.`,
    );
  }
  return n;
}

/** Basis points. 1000 = 10.00%. */
export const PLATFORM_FEE_BPS = () => envInt("PLATFORM_FEE_BPS", 1000);

/**
 * Placeholder sales-tax rate. There is no tax table in the schema and no
 * jurisdiction data on orders, so this is a flat rate applied to the subtotal.
 * Replace with Stripe Tax or a rates table before charging real customers in
 * a jurisdiction that taxes these offerings.
 */
export const TAX_BPS = () => envInt("TAX_BPS", 0);

export const DEEP_LINK_SCHEME = () => Deno.env.get("APP_DEEP_LINK_SCHEME") ?? "msn";

/**
 * Completes paid orders and bookings WITHOUT taking any money.
 *
 * This exists so the product can be exercised end to end before a Stripe key
 * arrives. It is a testing shortcut and nothing else.
 *
 * Three safeguards, because "temporary test flag reaches production" is a
 * well-worn way to lose money:
 *
 *  1. It is OFF unless the secret is set to exactly "true".
 *  2. It refuses to engage if STRIPE_SECRET_KEY is present — the moment real
 *     payments are configured, the bypass stops working on its own rather than
 *     silently continuing to give things away.
 *  3. Every affected order and booking is stamped `payment_bypassed` in the
 *     database, so they can be found and cleaned up later. They are test data,
 *     not revenue.
 *
 * Turn it off with:
 *   supabase secrets unset ALLOW_PAYMENT_BYPASS
 */
export function paymentBypassEnabled(): boolean {
  return (
    Deno.env.get("ALLOW_PAYMENT_BYPASS") === "true" &&
    !Deno.env.get("STRIPE_SECRET_KEY")
  );
}
