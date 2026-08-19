import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import { formatCancellationWindow, formatEventClock, formatEventTime, formatMoney } from '@/lib/format';
import type { BookServiceResponse } from '@/lib/queries/functions';
import { qk } from '@/lib/queries/keys';
import { payWithSheet } from '@/lib/payments/present-payment-sheet';
import { radii, spacing, useTheme } from '@/theme';

/**
 * What `book-service` actually puts on the wire, as opposed to what
 * `BookServiceResponse` claims.
 *
 * Two documented divergences, both load-bearing here:
 *
 * 1. The money is nested under `amounts`, not spread at the top level. Reading
 *    `result.total_cents` yields `undefined`, and `formatMoney(undefined, undefined)`
 *    throws inside `Intl.NumberFormat` ("Currency code is required"), taking the
 *    whole success screen down *after* the booking has been written.
 * 2. `payment` is sent as an explicit `null` on the free path rather than being
 *    omitted, so `payment !== undefined` is true for a booking that needs no
 *    payment at all.
 *
 * `cancellation_window_hours` is also returned — read straight off the inserted
 * booking row, so it is the snapshot, not the service's current value — which
 * makes it a legitimate fallback while the booking query is still in flight.
 *
 * The fix belongs in `src/lib/queries/functions.ts` (see the report); this type
 * is the defensive read until it lands.
 */
type WireBookingResult = Omit<BookServiceResponse, 'total_cents' | 'currency'> & {
  total_cents?: number | null;
  currency?: string | null;
  amounts?: {
    total_cents?: number | null;
    currency?: string | null;
  } | null;
  cancellation_window_hours?: number | null;
};

export interface BookingResultPanelProps {
  result: BookServiceResponse;
  /** Who the session is with. Used in the copy, not looked up again. */
  providerName: string;
  viewerTimeZone: string;
  providerTimeZone: string;
  /**
   * Read from the BOOKING row, never the service — the booking holds the
   * snapshot taken at creation. `null` while that row is still loading.
   */
  cancellationWindowHours: number | null;
  onViewBooking: () => void;
}

/**
 * What the screen becomes once `book-service` has answered.
 *
 * Three outcomes, and conflating them is the failure mode this component
 * exists to prevent:
 *
 * 1. **Payment outstanding.** The function handed back a Stripe client secret.
 *    The session is held, but nothing has been charged and the app cannot
 *    charge it yet. Saying "Booked" here would be a lie about money.
 * 2. **`requires_approval`.** The row is `requested`, not `confirmed`. The
 *    practitioner still has to accept, so the copy says a request was sent.
 * 3. **Confirmed.** The time is theirs.
 */
export function BookingResultPanel({
  result,
  providerName,
  viewerTimeZone,
  providerTimeZone,
  cancellationWindowHours,
  onViewBooking,
}: BookingResultPanelProps) {
  const theme = useTheme();
  const wire = result as WireBookingResult;

  // `!= null` on purpose: the free path sends `payment: null`, and treating that
  // as "payment outstanding" told someone their confirmed, zero-cost booking was
  // only being held.
  const awaitingPayment = result.payment != null;
  // The booking row's own status, not `requires_approval` — if the practitioner
  // needs to accept, the row is `requested` and nothing here may read as confirmed.
  const awaitingApproval = result.status === 'requested';
  const crossZone = providerTimeZone !== viewerTimeZone;

  const totalCents = wire.amounts?.total_cents ?? wire.total_cents ?? null;
  const currency = wire.amounts?.currency ?? wire.currency ?? null;

  const tone = awaitingPayment || awaitingApproval ? theme.colors.warning : theme.colors.success;
  // Approval outranks payment in the iconography: "we have to ask them" is the
  // bigger caveat, and a card glyph over a request that may be declined reads as
  // though the only thing left to do is pay.
  const icon = awaitingApproval
    ? 'hourglass-outline'
    : awaitingPayment
      ? 'card-outline'
      : 'checkmark-circle-outline';

  const title = awaitingApproval
    ? 'Request sent'
    : awaitingPayment
      ? 'Time held — payment coming soon'
      : 'Booked';

  const description = awaitingApproval
    ? awaitingPayment
      ? // Both caveats have to be said. Saying only one of them leaves the seeker
        // believing either that the time is theirs, or that the only outstanding
        // thing is money.
        `${providerName} still has to accept this — it is not confirmed until they do, and nothing has been charged. You will get a notification either way.`
      : `${providerName} will confirm this booking. You will get a notification either way — it is not confirmed until they accept.`
    : awaitingPayment
      ? `Your slot with ${providerName} is held and nothing has been charged. Paying inside the app is not switched on yet, so the practitioner will be in touch to settle it.`
      : `Your session with ${providerName} is confirmed.`;

  // The snapshot off the booking row, from whichever source has answered first.
  // Never the service — see the prop's doc comment.
  const windowHours = cancellationWindowHours ?? wire.cancellation_window_hours ?? null;

  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <View style={[styles.iconWell, { backgroundColor: theme.colors.surfaceMuted }]}>
        <Ionicons name={icon} size={32} color={tone} />
      </View>

      <Text variant="h2" heading={1} align="center">
        {title}
      </Text>
      <Text variant="body" color="secondary" align="center" style={styles.description}>
        {description}
      </Text>

      <Card variant="outlined" style={styles.card}>
        <DetailRow
          label="When"
          value={formatEventTime(result.starts_at, viewerTimeZone)}
          hint={
            crossZone
              ? `${formatEventClock(result.starts_at, providerTimeZone)} for ${providerName} (${providerTimeZone})`
              : undefined
          }
        />
        <DetailRow label="Reference" value={result.reference} />
        {/*
          Omitted rather than guessed at when the amount did not survive the
          response. A wrong number next to the word "Total" is worse than no row,
          and the reference above is enough to chase it up.
        */}
        {totalCents === null || currency === null ? null : (
          <DetailRow
            label="Total"
            value={formatMoney(totalCents, currency)}
            hint={awaitingPayment ? 'Not charged yet' : undefined}
          />
        )}
        {windowHours === null ? null : (
          <DetailRow
            label="Cancellation"
            value={formatCancellationWindow(windowHours)}
            hint="Locked to this booking — later edits to the service do not change it"
          />
        )}
      </Card>

      {awaitingPayment ? (
        /*
         * The card sheet, for a booking that needs paying.
         *
         * Opens on mount — the person already chose a time and pressed Book, so
         * a second button to actually pay is a step that exists only because of
         * how the code is arranged.
         *
         * On success this does NOT say "paid". `book-service` leaves the row
         * awaiting the Stripe webhook, and the client must not flip it: a
         * screen that says Paid without a settled charge produces a booking the
         * practitioner will honour and nobody will have paid for.
         */
        <PaymentStep
          clientSecret={result.payment?.client_secret ?? ''}
          publishableKey={result.payment?.publishable_key ?? null}
          bookingId={result.booking_id}
        />
      ) : null}

      <Button
        label="View booking"
        onPress={onViewBooking}
        fullWidth
        style={styles.action}
        accessibilityHint="Opens this booking, where you can message the practitioner or cancel"
      />
    </View>
  );
}

function DetailRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.detailRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text variant="bodySmall" color="muted" style={styles.detailLabel}>
        {label}
      </Text>
      <View style={styles.detailValue}>
        <Text variant="bodyStrong">{value}</Text>
        {hint ? (
          <Text variant="caption" color="muted">
            {hint}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    gap: spacing.xs,
  },
  iconWell: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  description: {
    maxWidth: 360,
  },
  card: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  detailLabel: {
    width: 96,
  },
  detailValue: {
    flex: 1,
  },
  notice: {
    alignSelf: 'stretch',
    padding: spacing.sm,
    borderRadius: radii.lg,
    marginTop: spacing.sm,
  },
  action: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
});

function PaymentStep({
  clientSecret,
  publishableKey,
  bookingId,
}: {
  clientSecret: string;
  publishableKey: string | null;
  bookingId: string;
}) {
  const theme = useTheme();
  const queryClient = useQueryClient();

  // See the note in `CheckoutSheet` — a mutation, not `useState`, so the write
  // is not a bare setter called from inside an effect.
  const payment = useMutation({
    mutationFn: () => payWithSheet({ clientSecret, publishableKey, label: 'My Source Network' }),
    onSuccess: (result) => {
      if (result.kind !== 'submitted') return;
      void queryClient.invalidateQueries({ queryKey: qk.bookings.all });
      void queryClient.invalidateQueries({ queryKey: qk.bookings.detail(bookingId) });
    },
  });

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
      <View style={[styles.notice, { backgroundColor: theme.colors.surfaceMuted }]}>
        <Text variant="bodySmall" color="secondary">
          Opening payment…
        </Text>
      </View>
    );
  }

  if (outcome?.kind === 'submitted') {
    return (
      <View style={[styles.notice, { backgroundColor: theme.colors.successSubtle }]}>
        <Text variant="bodySmall" color="success">
          Payment sent. We are confirming it with your bank — this booking is
          held for you in the meantime.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.notice, { backgroundColor: theme.colors.warningSubtle }]}>
      <Text variant="bodySmall" color="warning">
        {outcome?.kind === 'failed'
          ? `${outcome.message} You have not been charged, and the time is still held.`
          : 'You have not been charged. The time is still held — pay to confirm it.'}
      </Text>
      <Button label="Try again" variant="secondary" size="sm" onPress={() => payment.mutate()} />
    </View>
  );
}
