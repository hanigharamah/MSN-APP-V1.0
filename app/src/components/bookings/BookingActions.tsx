import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import type { BookingWithParties } from '@/lib/queries/bookings';
import type { RequestRefundResponse } from '@/lib/queries/functions';
import { borderWidths, radii, spacing, useTheme } from '@/theme';
import { ActionSheet, type ActionSheetOption } from './ActionSheet';
import {
  cancellationAlertMessage,
  hasEnded,
  hasStarted,
  isTerminalBooking,
  type CancellationTerms,
} from './cancellation';
import { useBookingActions, useOpenBookingConversation } from './use-booking-actions';

export interface BookingActionsProps {
  booking: BookingWithParties;
  viewerRole: 'seeker' | 'provider';
  viewerId: string;
  terms: CancellationTerms;
}

/** The reasons the refund sheet offers. Free text would be a form; this is a tap. */
const REFUND_REASONS: readonly { key: string; label: string }[] = [
  { key: 'not_delivered', label: 'The session did not happen' },
  { key: 'provider_cancelled', label: 'The practitioner cancelled' },
  { key: 'cancelled_in_window', label: 'I cancelled within the free window' },
  { key: 'quality', label: 'The session was not as described' },
  { key: 'other', label: 'Something else' },
];

/**
 * Reads a string off the refund response without trusting the declared shape.
 *
 * `RequestRefundResponse` in `lib/queries/functions.ts` says the function
 * returns `acknowledged_within` and `decision_within`. It does not — the live
 * `request-refund` function returns `acknowledged_at` and `decision_due`
 * (verified against the deployed function). Interpolating the declared names
 * put the words "undefined" in front of a customer on the one path that
 * succeeded. Until that type is corrected — it is outside this agent's files —
 * read whichever key is actually present and fall back to the policy wording
 * the function itself quotes.
 */
function readText(source: RequestRefundResponse, key: string): string | null {
  if (!(key in source)) return null;
  const value = (source as unknown as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** "3 business days" -> "within 3 business days"; leaves "within ..." alone. */
function asDuration(value: string): string {
  return /^(within|in|by)\b/i.test(value) ? value : `within ${value}`;
}

function refundConfirmationMessage(result: RequestRefundResponse): string {
  const decision =
    readText(result, 'decision_within') ??
    readText(result, 'decision_due') ??
    'within 3 business days';

  return [
    `An admin reviews every request. We will come back to you with a decision ${asDuration(decision)}.`,
    readText(result, 'remedy_note'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Everything the viewer can do to this booking, and nothing they cannot.
 *
 * What is available is decided by three things together — who is looking, what
 * the status is, and where the clock is — rather than by role alone:
 *
 *   provider, `requested`, not ended    confirm
 *   provider, `requested`               decline
 *   provider, `confirmed`, not started  cancel
 *   provider, `confirmed`, started     mark completed / no-show
 *   seeker,   `requested`               cancel (withdraw the request)
 *   seeker,   `confirmed`, not ended    cancel
 *   seeker,   paid on a refundable rail request a refund
 *   either                              message
 *
 * Two asymmetries worth stating, because both were bugs:
 *
 *   - **Confirm is gated on `!ended`, decline is not.** A request nobody
 *     answered before its date arrives is still `requested`, which is not a
 *     terminal status, so it sat in Past forever with no action that could
 *     close it. Confirming a session that has already been and gone is
 *     nonsense; declining one is exactly what happened.
 *   - **A seeker can cancel a `requested` booking.** Only the provider gets
 *     "decline". Restricting cancel to `confirmed` left a seeker waiting on an
 *     unresponsive practitioner with no way to withdraw.
 *
 * `TERMINAL_BOOKING_STATUSES` ends all of it except messaging and refunds: a
 * declined booking cannot be confirmed, and offering the button teaches people
 * to tap things that fail.
 *
 * Destructive actions go through `Alert` with `style: 'destructive'`; choices
 * between actions go through a bottom sheet. Native conventions win over the
 * web's centred confirm modal.
 */
export function BookingActions({ booking, viewerRole, viewerId, terms }: BookingActionsProps) {
  const theme = useTheme();
  const actions = useBookingActions(booking.id, viewerRole);
  const conversation = useOpenBookingConversation(booking, viewerId);

  const [finishSheetOpen, setFinishSheetOpen] = useState(false);
  const [refundSheetOpen, setRefundSheetOpen] = useState(false);
  /**
   * A refund request that already succeeded. The Edge Function 409s on a second
   * one ("refund_already_open"), so leaving the button live only buys the user
   * a guaranteed error.
   */
  const [refundOpened, setRefundOpened] = useState(false);

  /**
   * Latch against a second tap landing before React has re-rendered the button
   * into its disabled state. `isPending` is set asynchronously, so `disabled`
   * alone does not close the window — and two taps on two different rows of the
   * refund sheet would open two refund requests.
   */
  const inFlight = useRef(false);
  const fireOnce = (run: (settle: () => void) => void) => {
    if (inFlight.current || actions.isBusy) return;
    inFlight.current = true;
    run(() => {
      inFlight.current = false;
    });
  };

  const isProvider = viewerRole === 'provider';
  const isSeeker = viewerRole === 'seeker';

  const terminal = isTerminalBooking(booking.status);
  const ended = hasEnded(booking);
  const started = hasStarted(booking);
  const isRequested = booking.status === 'requested';

  const canConfirm = isProvider && isRequested && !ended;
  const canDecline = isProvider && isRequested;
  const canCancel =
    !terminal && !ended && (booking.status === 'confirmed' || (isSeeker && isRequested));
  const canFinish = isProvider && booking.status === 'confirmed' && started;
  const canRefund = isSeeker && !terms.isFree && terms.canRequestRefundInApp && !refundOpened;

  const failure =
    actions.confirm.error ??
    actions.decline.error ??
    actions.cancel.error ??
    actions.complete.error ??
    actions.noShow.error ??
    actions.refund.error ??
    conversation.error ??
    null;

  const reportFailure = (error: unknown) => {
    Alert.alert('That did not work', errorMessage(error));
  };

  // ---------------------------------------------------------------------------
  // Flows
  // ---------------------------------------------------------------------------

  const openRefundSheet = () => {
    if (refundOpened) return;
    setRefundSheetOpen(true);
  };

  const submitRefund = (reason: string) => {
    setRefundSheetOpen(false);
    if (refundOpened) return;
    fireOnce((settle) =>
      actions.refund.mutate(reason, {
        onError: reportFailure,
        onSettled: settle,
        onSuccess: (result) => {
          setRefundOpened(true);
          Alert.alert('Refund requested', refundConfirmationMessage(result));
        },
      }),
    );
  };

  const afterCancel = () => {
    if (viewerRole !== 'seeker' || terms.isFree) return;

    // Cancelling moved a status, not money. Say so, and put the refund one tap
    // away rather than letting the seeker assume it is on its way.
    if (!terms.canRequestRefundInApp) {
      Alert.alert('Booking cancelled', terms.storeRefundMessage);
      return;
    }

    Alert.alert(
      'Booking cancelled',
      terms.isWithinWindow
        ? 'You cancelled inside the free-cancellation window, so a refund should be due. No money moves on its own — open a request and an admin will review it.'
        : 'The free-cancellation window had passed, so this booking is non-refundable. You can still open a request if you think there are grounds.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Request a refund', onPress: openRefundSheet },
      ],
    );
  };

  const confirmCancel = () => {
    Alert.alert(
      viewerRole === 'provider' ? 'Cancel this session?' : 'Cancel this booking?',
      cancellationAlertMessage(terms, viewerRole),
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: () =>
            fireOnce((settle) =>
              actions.cancel.mutate(undefined, {
                onError: reportFailure,
                onSettled: settle,
                onSuccess: afterCancel,
              }),
            ),
        },
      ],
    );
  };

  const confirmDecline = () => {
    Alert.alert(
      'Decline this request?',
      ended
        ? 'This request was never answered and its time has passed. Declining closes it off and tells the seeker where they stand. It cannot be undone.'
        : 'The seeker will be told you declined and the time slot is released. This cannot be undone — they would have to request the session again.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () =>
            fireOnce((settle) =>
              actions.decline.mutate(undefined, { onError: reportFailure, onSettled: settle }),
            ),
        },
      ],
    );
  };

  const confirmNoShow = () => {
    Alert.alert(
      'Mark as no-show?',
      'This records that the seeker did not attend. It closes the booking and cannot be undone here.',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Mark no-show',
          style: 'destructive',
          onPress: () =>
            fireOnce((settle) =>
              actions.noShow.mutate(undefined, { onError: reportFailure, onSettled: settle }),
            ),
        },
      ],
    );
  };

  const confirmComplete = () => {
    Alert.alert(
      'Mark as completed?',
      'This closes the booking as a session that went ahead. It cannot be undone here.',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: 'Mark completed',
          onPress: () =>
            fireOnce((settle) =>
              actions.complete.mutate(undefined, { onError: reportFailure, onSettled: settle }),
            ),
        },
      ],
    );
  };

  const finishOptions: readonly ActionSheetOption[] = [
    {
      key: 'completed',
      label: 'Mark as completed',
      description: 'The session went ahead.',
      icon: 'checkmark-circle-outline',
      disabled: actions.isBusy,
      onPress: () => {
        setFinishSheetOpen(false);
        confirmComplete();
      },
    },
    {
      key: 'no-show',
      label: 'Mark as no-show',
      description: 'The seeker did not attend.',
      icon: 'person-remove-outline',
      tone: 'danger',
      disabled: actions.isBusy,
      onPress: () => {
        setFinishSheetOpen(false);
        confirmNoShow();
      },
    },
  ];

  const refundOptions: readonly ActionSheetOption[] = REFUND_REASONS.map((reason) => ({
    key: reason.key,
    label: reason.label,
    disabled: actions.isBusy || refundOpened,
    onPress: () => submitRefund(reason.label),
  }));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <Text variant="h4" heading={2}>
        {terminal ? 'This booking is closed' : 'Actions'}
      </Text>

      {terminal ? (
        <Text variant="bodySmall" color="muted">
          {isProvider
            ? 'You can still message the seeker about it.'
            : terms.isFree
              ? 'You can still message the practitioner about it.'
              : terms.canRequestRefundInApp
                ? 'You can still message about it, and open a refund request if money is owed.'
                : // A store-rail booking has no in-app refund route, closed or
                  // not. Offering one in the copy contradicts the button we
                  // deliberately do not render.
                  `You can still message about it. ${terms.storeRefundMessage}`}
        </Text>
      ) : null}

      {refundOpened ? (
        <Text variant="bodySmall" color="secondary" accessibilityLiveRegion="polite">
          A refund request is open on this booking. An admin will come back to you.
        </Text>
      ) : null}

      {canConfirm ? (
        <Button
          label="Confirm booking"
          onPress={() =>
            fireOnce((settle) =>
              actions.confirm.mutate(undefined, { onError: reportFailure, onSettled: settle }),
            )
          }
          loading={actions.confirm.isPending}
          disabled={actions.isBusy && !actions.confirm.isPending}
          fullWidth
          accessibilityLabel="Confirm booking"
          accessibilityHint="Accepts this request and holds the time slot"
        />
      ) : null}

      {canFinish ? (
        <Button
          label="Close out session"
          onPress={() => setFinishSheetOpen(true)}
          disabled={actions.isBusy}
          loading={actions.complete.isPending || actions.noShow.isPending}
          fullWidth
          accessibilityLabel="Close out session"
          accessibilityHint="Choose whether the session was completed or the seeker did not attend"
        />
      ) : null}

      <Button
        label="Message"
        // Guarded too: `useOpenBookingConversation` looks for an existing
        // thread before inserting, so two concurrent taps both find none and
        // both create one.
        onPress={() =>
          fireOnce((settle) =>
            conversation.mutate(undefined, { onError: reportFailure, onSettled: settle }),
          )
        }
        variant="secondary"
        loading={conversation.isPending}
        disabled={actions.isBusy}
        fullWidth
        accessibilityLabel={
          viewerRole === 'seeker' ? 'Message the practitioner' : 'Message the seeker'
        }
        accessibilityHint="Opens your conversation about this booking"
      />

      {canRefund ? (
        <Button
          label="Request a refund"
          onPress={openRefundSheet}
          variant="secondary"
          loading={actions.refund.isPending}
          disabled={actions.isBusy && !actions.refund.isPending}
          fullWidth
          accessibilityLabel="Request a refund"
          accessibilityHint="Opens a refund request for an admin to review"
        />
      ) : null}

      {canDecline ? (
        <Button
          label="Decline"
          onPress={confirmDecline}
          variant="danger"
          loading={actions.decline.isPending}
          disabled={actions.isBusy && !actions.decline.isPending}
          fullWidth
          accessibilityLabel="Decline this request"
          accessibilityHint="Turns the request down and releases the time slot. This cannot be undone."
        />
      ) : null}

      {canCancel ? (
        <Button
          label="Cancel booking"
          onPress={confirmCancel}
          variant="danger"
          loading={actions.cancel.isPending}
          disabled={actions.isBusy && !actions.cancel.isPending}
          fullWidth
          accessibilityLabel="Cancel this booking"
          accessibilityHint={
            terms.isWithinWindow
              ? 'Releases the time slot. You are inside the free cancellation window, but a refund is a separate request.'
              : 'Releases the time slot. The free cancellation window has passed, so this is non-refundable.'
          }
        />
      ) : null}

      {failure ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[
            styles.failure,
            {
              backgroundColor: theme.colors.dangerSubtle,
              borderColor: theme.colors.dangerBorder,
              borderRadius: radii.lg,
            },
          ]}
        >
          <Text variant="bodySmall" color="danger">
            {errorMessage(failure)}
          </Text>
        </View>
      ) : null}

      <ActionSheet
        visible={finishSheetOpen}
        title="How did it go?"
        description="Closing the session out tells the seeker where things stand and releases the booking."
        options={finishOptions}
        onClose={() => setFinishSheetOpen(false)}
      />

      <ActionSheet
        visible={refundSheetOpen}
        title="Why are you asking for a refund?"
        description="An admin reviews every request. Picking the closest reason gets it there faster."
        options={refundOptions}
        onClose={() => setRefundSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  failure: {
    padding: spacing.sm,
    borderWidth: borderWidths.hairline,
    marginTop: spacing.xxs,
  },
});
