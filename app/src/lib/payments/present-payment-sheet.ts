import { initPaymentSheet, initStripe, presentPaymentSheet } from '@stripe/stripe-react-native';

/**
 * Take a payment for an order or a booking.
 *
 * ## Why `initStripe` and not `<StripeProvider>`
 *
 * The provider wants a publishable key at mount, which would mean shipping the
 * key in the bundle. It arrives on the checkout response instead
 * (`payment.publishable_key`, set as a server secret), so the account can be
 * rotated or switched between test and live without an app release. `initStripe`
 * is the imperative equivalent and is what makes that possible — it is safe to
 * call more than once, so calling it per payment costs nothing.
 *
 * ## What this does NOT do
 *
 * It never marks anything paid. `orders` is not client-mutable, and
 * `orders_paid_has_timestamp` ties that transition to the Stripe webhook. A
 * sheet that succeeds means Stripe accepted the card, not that the money has
 * settled — the server decides that, and the caller waits for the row to change.
 *
 * Saying "paid" from here would be the worst available bug: the customer sees a
 * receipt, the database disagrees, and nobody finds out until they turn up
 * without a ticket.
 */
export type PaymentOutcome =
  /** Stripe accepted it. The server has NOT confirmed yet. */
  | { kind: 'submitted' }
  /** The person closed the sheet. Nothing was charged. */
  | { kind: 'cancelled' }
  /** Declined, or the sheet failed to open. `message` is safe to show. */
  | { kind: 'failed'; message: string };

export async function payWithSheet(input: {
  clientSecret: string;
  publishableKey: string | null;
  /** Shown in the sheet's header. The event or service name. */
  label: string;
}): Promise<PaymentOutcome> {
  if (!input.publishableKey) {
    // Deliberately explicit rather than a Stripe error: this is a server
    // misconfiguration (STRIPE_PUBLISHABLE_KEY unset), not anything the person
    // holding the phone did or can fix.
    return {
      kind: 'failed',
      message: 'Payments are not set up yet. Nothing has been charged.',
    };
  }

  await initStripe({ publishableKey: input.publishableKey });

  const init = await initPaymentSheet({
    paymentIntentClientSecret: input.clientSecret,
    merchantDisplayName: 'My Source Network',
    // Apple Pay is deliberately absent: it needs a merchant identifier and an
    // entitlement that are not configured. Offering a button that fails is
    // worse than not offering it.
    returnURL: 'msn://stripe-redirect',
  });

  if (init.error) {
    return { kind: 'failed', message: init.error.message };
  }

  const result = await presentPaymentSheet();

  if (result.error) {
    // `Canceled` is not a failure — it is a person changing their mind, and
    // showing them a red error for it is the wrong response.
    if (result.error.code === 'Canceled') return { kind: 'cancelled' };
    return { kind: 'failed', message: result.error.message };
  }

  return { kind: 'submitted' };
}
