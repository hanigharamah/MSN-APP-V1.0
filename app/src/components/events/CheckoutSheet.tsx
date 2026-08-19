import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { errorMessage, isAppError } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import type { EventWithHost } from '@/lib/queries/events';
import { createCheckout, type CheckoutAmounts, type CheckoutResponse } from '@/lib/queries/functions';
import { qk } from '@/lib/queries/keys';
import { payWithSheet } from '@/lib/payments/present-payment-sheet';
import { radii, spacing, useTheme } from '@/theme';
import { BottomSheet } from './BottomSheet';
import {
  selectedQuantity,
  selectionCurrency,
  subtotalCents,
  type SelectionLine,
} from './ticket-availability';

export interface CheckoutSheetProps {
  visible: boolean;
  onClose: () => void;
  event: EventWithHost;
  lines: readonly SelectionLine[];
  /** Chosen date on a recurring event, or null. */
  occurrenceId: string | null;
  /** Called after an order is created, so the screen can clear its steppers. */
  onOrderPlaced: () => void;
}

/**
 * Review, confirm, and whatever `create-checkout` says next.
 *
 * The web runs this as a five-screen wizard inside `#ticketModal`
 * (`select-ticket → select-recurring-dates → review-and-confirm → payment-info
 * → ticket-info`). Selection and date-picking already happen on the detail
 * screen here, so what is left is the review step and the outcome — one sheet
 * with four terminal states.
 *
 * ## What is sent
 *
 * Event id, occurrence id, and `{ ticket_type_id, quantity }` pairs. **No
 * prices.** `create-checkout` re-reads every `price_cents` from `ticket_types`,
 * which is the only reason a total can be trusted; the number this sheet shows
 * before confirming is explicitly labelled an estimate for the same reason.
 *
 * ## What comes back
 *
 * - **No `payment`** — the order was free and was fulfilled inline. Tickets
 *   exist. Straight to the success state.
 * - **A `payment.client_secret`** — a `pending` order and a Stripe
 *   PaymentIntent exist, and nothing has been charged. See the TODO on
 *   `PaymentPending` below; this build stops here rather than pretending.
 *
 * ## Exactly-once, and why it is entirely the client's job
 *
 * `create-checkout` has NO request-level idempotency. Its only idempotency key
 * is `order:<order.id>`, handed to Stripe *after* the order row is inserted, so
 * it dedupes PaymentIntents for one order and nothing else. Two identical
 * requests produce two orders — verified against the live function: two
 * concurrent calls for the same free tier returned two `paid` orders, issued
 * four tickets and moved `quantity_sold` by four.
 *
 * So every duplicate-submission guard has to live here:
 *
 *   1. The mutation does not retry (the app-wide default in `query-client.ts`).
 *   2. `Button` is inert while `loading`, which covers the ordinary double tap.
 *   3. `inFlight` is a ref, not state, so a second press landing in the same
 *      React batch as the first — before `isPending` has committed — is still
 *      refused.
 *   4. The sheet cannot be dismissed while the request is in flight. Dismissing
 *      used to run `mutation.reset()`, which cleared `isPending` and re-armed
 *      Confirm on the next open, over an order that already existed. That was
 *      the cheap tap that bought two of everything.
 */
export function CheckoutSheet({
  visible,
  onClose,
  event,
  lines,
  occurrenceId,
  onOrderPlaced,
}: CheckoutSheetProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  // See (3) above. A ref is read and written synchronously inside the press
  // handler; `mutation.isPending` only becomes true after React commits.
  const inFlight = useRef(false);

  // The submitted lines travel as the mutation's variables rather than being
  // read from the `lines` prop at render time. `onOrderPlaced` clears the
  // screen's steppers, so by the time the success state paints the prop is
  // already empty — `mutation.variables` is the snapshot of what was actually
  // ordered, and it is what "3 tickets issued" has to count.
  const mutation = useMutation({
    mutationFn: (submitted: readonly SelectionLine[]): Promise<CheckoutResponse> =>
      createCheckout({
        eventId: event.id,
        // `occurrence_id` is nullable server-side; only send one when chosen.
        ...(occurrenceId ? { occurrenceId } : {}),
        lines: submitted.map((line) => ({
          ticketTypeId: line.ticket.id,
          quantity: line.quantity,
        })),
      }),
    onSuccess: () => {
      // Stock moved, an order exists, and tickets may have been issued.
      void queryClient.invalidateQueries({ queryKey: qk.events.ticketTypes(event.id) });
      void queryClient.invalidateQueries({ queryKey: qk.orders.all });
      void queryClient.invalidateQueries({ queryKey: qk.tickets.all });
      onOrderPlaced();
    },
    onError: (error) => {
      // The safe message is rendered; the cause is Postgres/Edge detail.
      console.warn('[checkout] create-checkout failed', error);
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const submit = (toSubmit: readonly SelectionLine[]) => {
    if (inFlight.current || mutation.isPending || toSubmit.length === 0) return;
    inFlight.current = true;
    mutation.mutate(toSubmit);
  };

  const close = () => {
    // Never clear a request that is still in flight — see (4) in the header.
    // `dismissible` already blocks the scrim and the back gesture, so this is
    // the belt to that pair of braces.
    if (mutation.isPending) return;
    mutation.reset();
    onClose();
  };

  const goToBookings = () => {
    close();
    router.push('/(tabs)/bookings');
  };

  const response = mutation.data;
  const submitted = mutation.variables ?? [];

  let body: ReactNode;
  let footer: ReactNode;

  if (mutation.isError) {
    const failure = failureFor(mutation.error, event);
    // "Check my orders" leads, because an order that may already exist is the
    // more urgent fact than a retry that could create a second one.
    const primaryTaken = failure.shouldCheckOrders;
    body = <CheckoutFailureBody failure={failure} />;
    footer = (
      <>
        {failure.shouldCheckOrders ? (
          <Button label="Check my orders" onPress={goToBookings} fullWidth />
        ) : null}
        {failure.canRetry ? (
          <Button
            label="Try again"
            variant={primaryTaken ? 'secondary' : 'primary'}
            onPress={() => submit(submitted)}
            fullWidth
          />
        ) : null}
        {failure.shouldRefreshTickets ? (
          <Button
            label={failure.refreshLabel ?? 'Refresh tickets'}
            variant={primaryTaken || failure.canRetry ? 'secondary' : 'primary'}
            fullWidth
            onPress={() => {
              void queryClient.invalidateQueries({ queryKey: qk.events.all });
              close();
            }}
          />
        ) : null}
        <Button label="Close" variant="ghost" fullWidth onPress={close} />
      </>
    );
  } else if (response && !response.payment) {
    body = <FreeOrderSuccess response={response} ticketCount={selectedQuantity(submitted)} />;
    footer = <SuccessActions onClose={close} onViewTickets={goToBookings} />;
  } else if (response) {
    body = <PaymentPending response={response} />;
    footer = <Button label="Done" onPress={close} fullWidth />;
  } else {
    const currency = selectionCurrency(lines);
    body = <OrderReview event={event} lines={lines} />;
    footer = (
      <Button
        label={confirmLabelFor(lines)}
        onPress={() => submit(lines)}
        loading={mutation.isPending}
        // `mixed` is unbuyable by construction: `assertSameCurrency` in the
        // function rejects it with a 422 before an order is ever inserted. The
        // bottom bar does not open the sheet in that state; this is the second
        // lock on the same door, for a selection that changed under an open
        // sheet.
        disabled={lines.length === 0 || currency.kind === 'mixed'}
        fullWidth
        accessibilityHint="Creates your order. Prices are confirmed by the server."
      />
    );
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      dismissible={!mutation.isPending}
      title={titleFor(mutation.isError, response)}
      footer={footer}
    >
      {body}
    </BottomSheet>
  );
}

function titleFor(isError: boolean, response: CheckoutResponse | undefined): string {
  if (isError) return 'Checkout';
  if (!response) return 'Review your order';
  return response.payment ? 'Almost there' : 'You are going';
}

function confirmLabelFor(lines: readonly SelectionLine[]): string {
  return subtotalCents(lines) === 0 ? 'Get my tickets' : 'Confirm order';
}

// -----------------------------------------------------------------------------
// Review
// -----------------------------------------------------------------------------

/**
 * The review step.
 *
 * The total is formatted in the currency of the SELECTED ticket types, not
 * `events.currency`. They are separate columns with no constraint between them
 * (`ticket_types.currency` is per row), so an event listed as `GBP` can carry a
 * `EUR` tier — and formatting €15 as "£15.00" is a wrong price, not a wrong
 * label. When the selection spans currencies there is no total to print at all:
 * `create-checkout` rejects it with a 422 `mixed_currency` before any order
 * exists, and a summed figure would be an amount in no currency whatsoever.
 */
function OrderReview({
  event,
  lines,
}: {
  event: EventWithHost;
  lines: readonly SelectionLine[];
}) {
  const theme = useTheme();
  const estimate = subtotalCents(lines);
  const currency = selectionCurrency(lines);

  return (
    <View style={styles.stack}>
      <Text variant="bodyStrong" numberOfLines={2}>
        {event.title}
      </Text>

      <View style={styles.lines}>
        {lines.map((line) => (
          <View key={line.ticket.id} style={styles.lineRow}>
            <Text variant="bodySmall" style={styles.lineLabel} numberOfLines={2}>
              {line.quantity} × {line.ticket.name}
            </Text>
            <Text variant="bodySmall" color="secondary">
              {line.ticket.price_cents === 0
                ? 'Free'
                : formatMoney(line.ticket.price_cents * line.quantity, line.ticket.currency)}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      {currency.kind === 'mixed' ? (
        <View accessible accessibilityRole="alert">
          <Text variant="bodyStrong" color="warning">
            These tickets use different currencies
          </Text>
          <Text variant="bodySmall" color="secondary">
            {currency.currencies.join(' and ')} cannot be charged as one payment. Go back and order
            each currency separately.
          </Text>
        </View>
      ) : (
        <View style={styles.lineRow}>
          <Text variant="bodyStrong">Estimated total</Text>
          <Text variant="bodyStrong" color="heading">
            {estimate === 0 || currency.kind === 'none'
              ? 'Free'
              : formatMoney(estimate, currency.currency)}
          </Text>
        </View>
      )}

      <Text variant="caption" color="muted">
        My Source Network prices every ticket on the server, so this figure is an estimate until you
        confirm. It covers the tickets only — any tax and the service fee are added on top, and the
        full total is shown before anything is charged.
      </Text>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Outcomes
// -----------------------------------------------------------------------------

function FreeOrderSuccess({
  response,
  ticketCount,
}: {
  response: CheckoutResponse;
  ticketCount: number;
}) {
  const theme = useTheme();

  return (
    <View style={styles.stack} accessible accessibilityLiveRegion="polite">
      <View style={[styles.well, { backgroundColor: theme.colors.successSubtle }]}>
        <Ionicons name="checkmark-circle" size={32} color={theme.colors.successText} />
      </View>
      <Text variant="h4">
        {ticketCount} {ticketCount === 1 ? 'ticket' : 'tickets'} issued
      </Text>
      <Text variant="bodySmall" color="secondary">
        This was a free order, so it is already complete. Your tickets are in Bookings, and the QR
        code on each one is what gets scanned at the door.
      </Text>
      <ReferenceRow reference={response.reference} />
    </View>
  );
}

/**
 * A `pending` order and a Stripe PaymentIntent exist. Nothing is charged yet.
 *
 * The sheet opens on mount rather than behind another button. By this point the
 * person has already chosen tickets and pressed Pay — asking them to press a
 * second thing to actually pay is a step that exists only because of how the
 * code is arranged.
 *
 * ## Why "submitted" is not "paid"
 *
 * A successful sheet means Stripe accepted the card. It does not mean the money
 * has settled, and this screen must not say otherwise: `orders` is not
 * client-mutable and `orders_paid_has_timestamp` ties that transition to the
 * Stripe webhook. So the copy says we are confirming, the order list is
 * invalidated, and the server flips the row when the webhook lands.
 *
 * Claiming a receipt here would be the worst available bug — the customer sees
 * one, the database disagrees, and nobody finds out until the door.
 */
function PaymentPending({ response }: { response: CheckoutResponse }) {
  const theme = useTheme();
  const queryClient = useQueryClient();

  /*
   * A mutation rather than `useState` + an async function, and not only for
   * tidiness: calling a plain setter from inside an effect trips
   * `react-hooks/set-state-in-effect`, because the rule cannot see that the
   * write happens after an await. react-query owns the pending/result state
   * here, which is both the idiom used everywhere else in this codebase and
   * structurally correct rather than a suppressed warning.
   */
  const payment = useMutation({
    mutationFn: () =>
      payWithSheet({
        clientSecret: response.payment?.client_secret ?? '',
        publishableKey: response.payment?.publishable_key ?? null,
        label: 'My Source Network',
      }),
    onSuccess: (result) => {
      if (result.kind !== 'submitted') return;
      void queryClient.invalidateQueries({ queryKey: qk.orders.all });
      void queryClient.invalidateQueries({ queryKey: qk.bookings.all });
    },
  });

  // Opens once, on arrival. The guard matters: without it a re-render while the
  // sheet is up would ask Stripe to present a second one.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    payment.mutate();
  }, [payment]);

  const outcome = payment.data ?? null;
  const busy = payment.isPending || outcome === null;

  if (busy) {
    return (
      <View style={styles.stack} accessible accessibilityLiveRegion="polite">
        <ActivityIndicator color={theme.colors.accent} />
        <Text variant="h4">Opening payment</Text>
        <ReferenceRow reference={response.reference} />
      </View>
    );
  }

  if (outcome?.kind === 'submitted') {
    return (
      <View style={styles.stack} accessible accessibilityLiveRegion="polite">
        <View style={[styles.well, { backgroundColor: theme.colors.successSubtle }]}>
          <Ionicons name="checkmark-circle-outline" size={32} color={theme.colors.successText} />
        </View>
        <Text variant="h4">Payment sent</Text>
        <Text variant="bodySmall" color="secondary">
          We are confirming it with your bank. Your tickets appear in Bookings as
          soon as it clears — usually a few seconds.
        </Text>
        <AmountsBreakdown amounts={response.amounts} currency={response.currency} />
        <ReferenceRow reference={response.reference} />
      </View>
    );
  }

  const cancelled = outcome?.kind === 'cancelled';

  return (
    <View style={styles.stack} accessible accessibilityLiveRegion="polite">
      <View
        style={[
          styles.well,
          { backgroundColor: cancelled ? theme.colors.surfaceMuted : theme.colors.dangerSubtle },
        ]}
      >
        <Ionicons
          name={cancelled ? 'card-outline' : 'alert-circle-outline'}
          size={32}
          color={cancelled ? theme.colors.textSecondary : theme.colors.dangerText}
        />
      </View>

      <Text variant="h4">{cancelled ? 'Payment not finished' : 'That payment failed'}</Text>

      <Text variant="bodySmall" color="secondary">
        {cancelled
          ? 'You have not been charged. Your order is held as pending — try again, or find it in Bookings.'
          : outcome?.kind === 'failed'
            ? `${outcome.message} You have not been charged.`
            : 'You have not been charged.'}
      </Text>

      <Button label="Try again" onPress={() => payment.mutate()} />

      <AmountsBreakdown amounts={response.amounts} currency={response.currency} />
      <ReferenceRow reference={response.reference} />
    </View>
  );
}

function AmountsBreakdown({
  amounts,
  currency,
}: {
  amounts: CheckoutAmounts;
  currency: string;
}) {
  const theme = useTheme();

  const rows: { label: string; cents: number }[] = [
    { label: 'Subtotal', cents: amounts.subtotal_cents },
    ...(amounts.discount_cents > 0 ? [{ label: 'Discount', cents: -amounts.discount_cents }] : []),
    ...(amounts.tax_cents > 0 ? [{ label: 'Tax', cents: amounts.tax_cents }] : []),
    ...(amounts.platform_fee_cents > 0
      ? [{ label: 'Service fee', cents: amounts.platform_fee_cents }]
      : []),
  ];

  return (
    <View style={[styles.amounts, { backgroundColor: theme.colors.surfaceMuted }]}>
      {rows.map((row) => (
        <View key={row.label} style={styles.lineRow}>
          <Text variant="bodySmall" color="secondary">
            {row.label}
          </Text>
          <Text variant="bodySmall" color="secondary">
            {formatMoney(row.cents, currency)}
          </Text>
        </View>
      ))}
      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
      <View style={styles.lineRow}>
        <Text variant="bodyStrong">Total due</Text>
        <Text variant="bodyStrong" color="heading">
          {formatMoney(amounts.total_cents, currency)}
        </Text>
      </View>
    </View>
  );
}

function ReferenceRow({ reference }: { reference: string }) {
  return (
    <Text variant="caption" color="muted" selectable>
      Order reference {reference}
    </Text>
  );
}

function SuccessActions({
  onClose,
  onViewTickets,
}: {
  onClose: () => void;
  onViewTickets: () => void;
}) {
  return (
    <>
      <Button label="View my tickets" fullWidth onPress={onViewTickets} />
      <Button label="Done" variant="ghost" fullWidth onPress={onClose} />
    </>
  );
}

// -----------------------------------------------------------------------------
// Failure
// -----------------------------------------------------------------------------

interface CheckoutFailure {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  /**
   * Safe to send the identical request again — meaning we know no order was
   * created. Never true on its own for a transport failure; see `network`.
   */
  canRetry: boolean;
  /** Our view of stock, sale windows or dates is stale. */
  shouldRefreshTickets: boolean;
  /** Overrides the refresh button's label when "tickets" is the wrong noun. */
  refreshLabel?: string;
  /** An order may exist despite the failure. Send them to look before retrying. */
  shouldCheckOrders: boolean;
}

/**
 * Turns a `create-checkout` rejection into something a person can act on.
 *
 * ## Why this switches on `error.code` and not only on `AppError.kind`
 *
 * The function's whole vocabulary of refusals — `insufficient_inventory`,
 * `sales_not_open`, `sales_closed`, `ticket_type_inactive`, `mixed_currency`,
 * `event_not_on_sale`, `event_has_ended`, `occurrence_cancelled` — arrives as
 * 409 or 422, which `kindForStatus` flattens to a single `validation`. Treating
 * them alike produced one sentence for all of them, and that sentence guessed:
 * "Someone may have bought the last of them while you were choosing" is simply
 * false when the answer is "sales have not opened yet" or "these tickets are in
 * two different currencies". `invoke()` already carries the function's `code`
 * onto `AppError.code`, so the distinct sentence each case deserves is a lookup,
 * not a guess. Every code below was fired against the live function.
 *
 * ## Why some server messages are replaced rather than rendered
 *
 * The function's `message` is written for whoever is integrating against it, and
 * mostly reads fine to a customer. Three do not, and they are the ones that
 * matter most:
 *
 *   - `missing_configuration` says "The STRIPE_SECRET_KEY secret is not set on
 *     this Edge Function", which is an internal deployment detail and must not
 *     be shown to a buyer.
 *   - `sales_not_open` / `sales_closed` embed a raw ISO timestamp.
 *
 * ## Retry, on a call that is not idempotent
 *
 * There is no request-level idempotency key (see the component header), so a
 * "Try again" that fires after the server already committed an order creates a
 * second one. A transport failure is precisely the case where the client cannot
 * tell whether that happened, so `network` no longer offers a bare retry — it
 * leads with "Check my orders" and says why.
 */
function failureFor(error: unknown, event: EventWithHost): CheckoutFailure {
  const kind = isAppError(error) ? error.kind : 'unknown';
  const code = isAppError(error) ? error.code : undefined;

  const stale = (message: string, refreshLabel?: string): CheckoutFailure => ({
    icon: 'refresh-outline',
    title: 'Tickets changed',
    message,
    canRetry: false,
    shouldRefreshTickets: true,
    ...(refreshLabel === undefined ? {} : { refreshLabel }),
    shouldCheckOrders: false,
  });

  switch (code) {
    // ------------------------------------------------------- stock and windows
    case 'insufficient_inventory':
      return stale(
        `${errorMessage(error)} Someone may have bought them while you were choosing.`,
      );
    case 'over_max_per_order':
      return stale(errorMessage(error));
    case 'ticket_type_inactive':
    case 'ticket_type_not_found':
      return stale('The host has taken one of the tickets you chose off sale.');
    case 'sales_not_open':
      return stale('Sales for one of the tickets you chose have not opened yet.');
    case 'sales_closed':
      return stale('Sales for one of the tickets you chose have closed.');

    // ------------------------------------------------------------------ dates
    case 'occurrence_cancelled':
      return stale('The host has cancelled the date you chose.', 'Refresh dates');
    case 'occurrence_not_found':
      return stale('The date you chose is no longer part of this event.', 'Refresh dates');

    // ----------------------------------------------------------------- event
    case 'event_not_on_sale':
      return {
        icon: 'close-circle-outline',
        title: 'No longer on sale',
        message:
          event.status === 'cancelled'
            ? 'The host has cancelled this event. Nothing has been ordered or charged.'
            : 'The host has taken this event off sale. Nothing has been ordered or charged.',
        canRetry: false,
        shouldRefreshTickets: true,
        refreshLabel: 'Refresh event',
        shouldCheckOrders: false,
      };
    case 'event_has_ended':
      return {
        icon: 'time-outline',
        title: 'This event has finished',
        message: 'It ended before the order went through, so nothing has been ordered or charged.',
        canRetry: false,
        shouldRefreshTickets: true,
        refreshLabel: 'Refresh event',
        shouldCheckOrders: false,
      };

    // -------------------------------------------------------------- currency
    case 'mixed_currency':
      return {
        icon: 'swap-horizontal-outline',
        title: 'Two currencies in one order',
        message:
          'The tickets you chose are priced in different currencies, and one payment cannot span two. Nothing has been ordered. Go back and order each currency separately.',
        canRetry: false,
        shouldRefreshTickets: false,
        shouldCheckOrders: false,
      };
    case 'below_minimum_charge':
      return {
        icon: 'pricetag-outline',
        title: 'This total is too small to charge',
        message:
          'The card networks will not process an amount this small, so nothing has been ordered. Add another ticket, or message the host.',
        canRetry: false,
        shouldRefreshTickets: false,
        shouldCheckOrders: false,
      };

    // ---------------------------------------------------- our side, not theirs
    case 'missing_configuration':
    case 'invalid_configuration':
      // The server's message names an unset secret. Never render it.
      return {
        icon: 'card-outline',
        title: 'Card payment is not available',
        message:
          'Paid checkout is not switched on in this build, so we stopped before taking any money. You have not been charged — but an unpaid order may have been started, so check Bookings before trying again.',
        canRetry: false,
        shouldRefreshTickets: false,
        shouldCheckOrders: true,
      };
    case 'inventory_contention':
      return {
        icon: 'hourglass-outline',
        title: 'Too many people at once',
        message:
          'These tickets are being bought faster than we could record it. Check Bookings — your order may have gone through.',
        canRetry: false,
        shouldRefreshTickets: false,
        shouldCheckOrders: true,
      };
  }

  // Stripe's own refusals (`stripe_card_declined` and friends) arrive as 402.
  // Their messages are written for cardholders, so they are rendered as-is.
  if (code?.startsWith('stripe_')) {
    return {
      icon: 'card-outline',
      title: 'Your payment was declined',
      message: `${errorMessage(error)} Nothing has been charged.`,
      canRetry: false,
      shouldRefreshTickets: false,
      shouldCheckOrders: true,
    };
  }

  if (kind === 'forbidden' && event.delivery_mode === 'online_live') {
    return {
      icon: 'logo-apple-appstore',
      title: 'Not available in the app',
      message:
        'Live online events have to be sold through in-app purchase, which is not switched on in this build yet. Nothing has been ordered or charged. Message the host to ask how else to join.',
      canRetry: false,
      shouldRefreshTickets: false,
      shouldCheckOrders: false,
    };
  }

  if (kind === 'forbidden') {
    return {
      icon: 'lock-closed-outline',
      title: 'Not available',
      message: `${errorMessage(error)} Nothing has been ordered or charged.`,
      canRetry: false,
      shouldRefreshTickets: false,
      shouldCheckOrders: false,
    };
  }

  if (kind === 'auth') {
    return {
      icon: 'person-circle-outline',
      title: 'Sign in again',
      message: `${errorMessage(error)} Nothing has been ordered or charged.`,
      canRetry: false,
      shouldRefreshTickets: false,
      shouldCheckOrders: false,
    };
  }

  if (kind === 'network') {
    return {
      icon: 'cloud-offline-outline',
      title: 'No connection',
      message:
        'We lost the connection before we heard back, so we cannot tell whether your order went through. Check Bookings first — trying again could order the same tickets twice.',
      // Deliberately offered as the secondary action, behind "Check my orders".
      canRetry: true,
      shouldRefreshTickets: false,
      shouldCheckOrders: true,
    };
  }

  // Anything unrecognised — including a 500 `internal_error`, which the function
  // raises only after it has already inserted the order row.
  return {
    icon: 'alert-circle-outline',
    title: 'Something went wrong',
    message: `${errorMessage(error)} Check Bookings before trying again — your order may still have been created.`,
    canRetry: false,
    shouldRefreshTickets: false,
    shouldCheckOrders: true,
  };
}

function CheckoutFailureBody({ failure }: { failure: CheckoutFailure }) {
  const theme = useTheme();

  return (
    <View
      style={styles.stack}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${failure.title}. ${failure.message}`}
    >
      <View style={[styles.well, { backgroundColor: theme.colors.dangerSubtle }]}>
        <Ionicons name={failure.icon} size={32} color={theme.colors.dangerText} />
      </View>
      <Text variant="h4">{failure.title}</Text>
      <Text variant="bodySmall" color="secondary">
        {failure.message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.xs,
  },
  lines: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  lineLabel: {
    flex: 1,
  },
  divider: {
    height: 1,
    marginVertical: spacing.xs,
  },
  amounts: {
    padding: spacing.sm,
    borderRadius: radii.lg,
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  well: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxs,
  },
});
