// =============================================================================
// Money
// =============================================================================
// Integer cents everywhere. No floats, no currency strings parsed from the
// client, no price ever taken from a request body — every amount in here comes
// from a column the client cannot write.

import { PLATFORM_FEE_BPS, TAX_BPS } from "./env.ts";
import { unprocessable } from "./errors.ts";

export interface Totals {
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  platform_fee_cents: number;
  total_cents: number;
}

/** Half-up rounding on an integer basis-point calculation. */
export function applyBps(amountCents: number, bps: number): number {
  return Math.round((amountCents * bps) / 10000);
}

export function computeTotals(subtotalCents: number, discountCents = 0): Totals {
  const subtotal = Math.max(0, Math.trunc(subtotalCents));
  const discount = Math.min(Math.max(0, Math.trunc(discountCents)), subtotal);
  const taxable = subtotal - discount;
  const tax = applyBps(taxable, TAX_BPS());
  const fee = applyBps(taxable, PLATFORM_FEE_BPS());
  return {
    subtotal_cents: subtotal,
    discount_cents: discount,
    tax_cents: tax,
    platform_fee_cents: fee,
    total_cents: taxable + tax + fee,
  };
}

/**
 * Stripe's minimum charge is 50 minor units in every currency it settles in
 * (50¢, ¥50, 50p). Below that the PaymentIntent is rejected with a message
 * aimed at developers, not customers — so catch it here, where we can say
 * something the app can act on.
 */
const STRIPE_MINIMUM_MINOR_UNITS = 50;

export function assertChargeable(totalCents: number, currency: string): void {
  const code = currency.toUpperCase();
  const minimum = STRIPE_MINIMUM_MINOR_UNITS;
  if (totalCents > 0 && totalCents < minimum) {
    throw unprocessable(
      "below_minimum_charge",
      `The order total is ${totalCents} ${code}, which is below the ${minimum} minimum Stripe will accept.`,
      "Raise the ticket price, or mark the offering free so it takes the zero-cost path.",
    );
  }
}

export function assertSameCurrency(codes: string[], context: string): string {
  const distinct = [...new Set(codes.map((c) => c.toUpperCase()))];
  if (distinct.length > 1) {
    throw unprocessable(
      "mixed_currency",
      `${context} mixes currencies: ${distinct.join(", ")}. One payment cannot span two currencies.`,
      "Split the purchase into one request per currency, or fix the listing so all its prices share a currency.",
    );
  }
  return distinct[0] ?? "USD";
}

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
