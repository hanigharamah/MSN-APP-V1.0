import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import {
  AdminNotice,
  DECLINE_CONSEQUENCE,
  DeclineSheet,
  FactList,
  REFUND_DECISION_SLA_BUSINESS_DAYS,
  REFUND_ERROR,
  SearchEntry,
  WaitingPill,
  adminQueueKeys,
  amountToRefund,
  approvalBlockFor,
  approvalConsequence,
  decideRefund,
  getRefundForDecision,
  refundDeadlineSentence,
  refundSubjectOf,
  urgencyFor,
  type Fact,
  type RefundDecisionInput,
  type RefundDecisionResult,
  type RefundForDecision,
  type RefundSubject,
} from '@/components/admin';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  SkeletonList,
  Text,
  bookingStatusBadge,
  orderStatusBadge,
  refundStatusBadge,
} from '@/components/ui';
import { isAppError } from '@/lib/errors';
import {
  formatEventRange,
  formatEventTime,
  formatLocal,
  formatMoney,
  timeZoneSuffix,
} from '@/lib/format';
import { qk } from '@/lib/queries/keys';
import { spacing } from '@/theme';
import type { BookingStatus, OrderStatus } from '@/types/database';

/**
 * =============================================================================
 * One refund request — the context, then the choice
 * =============================================================================
 *
 * ## What this screen is for
 *
 * A person asked for their money back and is waiting for an answer. This
 * screen puts everything that changes that answer on one page, in a fixed
 * order, and then offers exactly two actions. It is not a record view of
 * `refund_requests`; nothing is here because the column exists.
 *
 * The reading order is the deciding order: who is asking and how long they
 * have waited, what they said, what they actually bought, what approving would
 * cost, anything that makes approval impossible, and only then the buttons.
 *
 * ## The three rules that are not negotiable
 *
 * **1. You cannot refund an Apple or Google purchase.** The store took the
 * money; MSN never received it. `request-refund` refuses to *create* these,
 * but the screen must not assume that — rows predating the check, direct
 * inserts and data migrations all exist. So the rail is read from the row
 * itself and, when it is a store rail, there is no Approve button at all. Not
 * a disabled one: an approve that could never work should not be drawn.
 *
 * **2. Approving does not move money by itself.** `process-refund` does, and
 * it can fail — `STRIPE_SECRET_KEY` may not be set, the payment intent may be
 * missing, another admin may have decided first. Every one of those leaves the
 * request exactly as it was, and the failure notice says so in those words.
 * The mutation is never optimistic and the screen never renders a decision it
 * has not been told happened.
 *
 * **3. `payment_bypassed` means no money was ever taken.** The row was
 * completed by the test-mode bypass. There is nothing to return, so again:
 * no Approve button, and a notice explaining why rather than an error after
 * the tap.
 *
 * ## What is deliberately not here
 *
 * Partial refunds. The Edge Function supports an arbitrary `amount_cents`, and
 * exposing it would turn two clear actions into a form. The amount sent is
 * what the customer claimed, capped at what they paid, and it is stated on
 * screen before the tap — so the operator always knows the figure, they just
 * do not get to invent a new one here.
 */
export default function RefundDecisionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [declineOpen, setDeclineOpen] = useState(false);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: adminQueueKeys.refunds.detail(id),
    queryFn: () => getRefundForDecision(id),
    enabled: Boolean(id),
  });

  /**
   * Not retried, ever.
   *
   * `query-client.ts` already disables mutation retries, and this is the
   * reason the default exists: `process-refund` is idempotent on the Stripe
   * side for one exact amount, but a blind retry after an ambiguous network
   * failure is how a customer gets told twice, or told something different
   * from what happened.
   */
  const decide = useMutation({
    mutationFn: (input: RefundDecisionInput) => decideRefund(input),
    onSuccess: () => {
      setDeclineOpen(false);
      // Prefix invalidation: `qk.refunds.all` covers both this detail query and
      // the admin queue's pending list, and the subject's status changed too.
      void queryClient.invalidateQueries({ queryKey: qk.refunds.all });
      void queryClient.invalidateQueries({ queryKey: qk.orders.all });
      void queryClient.invalidateQueries({ queryKey: qk.bookings.all });
    },
  });

  if (isPending) {
    return (
      <Screen scroll safeBottom>
        <SkeletonList count={4} itemHeight={120} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen safeBottom>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen safeBottom>
        <EmptyState
          icon="help-circle-outline"
          title="That refund request is gone"
          description="It may have been deleted since the queue was loaded. Nothing was decided."
          actionLabel="Back to the queue"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <RefundDecision
      refund={data}
      onDecide={(input) => decide.mutate(input)}
      submitting={decide.isPending}
      failure={decide.error}
      outcome={decide.isSuccess ? decide.data : null}
      declineOpen={declineOpen}
      onOpenDecline={() => setDeclineOpen(true)}
      onCloseDecline={() => setDeclineOpen(false)}
      onOpenPerson={(personId) => router.push(`/(admin)/people/${personId}` as Href)}
      onBack={() => router.back()}
    />
  );
}

interface RefundDecisionProps {
  refund: RefundForDecision;
  onDecide: (input: RefundDecisionInput) => void;
  submitting: boolean;
  failure: unknown;
  outcome: RefundDecisionResult | null;
  declineOpen: boolean;
  onOpenDecline: () => void;
  onCloseDecline: () => void;
  onOpenPerson: (personId: string) => void;
  onBack: () => void;
}

function RefundDecision({
  refund,
  onDecide,
  submitting,
  failure,
  outcome,
  declineOpen,
  onOpenDecline,
  onCloseDecline,
  onOpenPerson,
  onBack,
}: RefundDecisionProps) {
  const now = new Date();

  const subject = refundSubjectOf(refund);
  const block = approvalBlockFor(subject);
  const status = refundStatusBadge(refund.status);

  /**
   * A decision made in this session counts as settled straight away.
   *
   * Not optimism — the server has already confirmed it, `outcome` *is* the
   * server's reply. The read query is invalidated on success but a refetch is
   * a round trip, and for those few hundred milliseconds `refund.status` still
   * says `requested`. Leaving the buttons live over that gap offers a second
   * decision on a request that has already been answered; the second tap would
   * come back `refund_already_decided`, which is handled but is the wrong
   * thing to have offered.
   */
  const decidedNow = outcome !== null;
  const decidedEarlier = refund.status !== 'requested';
  const settled = decidedEarlier || decidedNow;

  const requesterName = refund.requester?.display_name ?? 'This person';
  const amountCents = subject ? amountToRefund(refund, subject) : null;
  const amountLabel =
    amountCents !== null && subject ? formatMoney(amountCents, subject.currency) : null;

  const canApprove = !settled && block === null && subject !== null && amountCents !== null;
  const canDecline = !settled && (block === null || block.canStillDecline);

  const approve = () => {
    if (!canApprove || subject === null || amountLabel === null || amountCents === null) return;

    Alert.alert(
      `Refund ${amountLabel} to ${requesterName}?`,
      approvalConsequence(amountLabel, subject),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Refund ${amountLabel}`,
          onPress: () =>
            onDecide({
              refundRequestId: refund.id,
              decision: 'approve',
              amountCents,
            }),
        },
      ],
    );
  };

  return (
    <Screen scroll safeBottom contentContainerStyle={styles.screen}>
      {/* ---------------------------------------------------- who is waiting */}
      <Card variant="outlined">
        <View style={styles.person}>
          <Avatar uri={refund.requester?.avatar_url} name={requesterName} size="lg" />
          <View style={styles.personText}>
            <Text variant="h4" heading={1} numberOfLines={2}>
              {requesterName}
            </Text>
            {refund.requester?.handle ? (
              <Text variant="bodySmall" color="muted">
                @{refund.requester.handle}
              </Text>
            ) : null}
          </View>
          <Badge label={status.label} tone={status.tone} />
        </View>

        <View style={styles.timing}>
          <WaitingPill
            since={refund.created_at}
            urgency={urgencyFor(refund.created_at, REFUND_DECISION_SLA_BUSINESS_DAYS, now)}
            now={now}
          />
          <Text variant="caption" color="muted" style={styles.deadline}>
            {settled ? 'Already decided.' : refundDeadlineSentence(refund.created_at, now)}
          </Text>
        </View>
      </Card>

      {/* ------------------------------------------------------- their words */}
      <View style={styles.section}>
        <Text variant="h4" heading={2}>
          In their words
        </Text>
        <Card variant="filled">
          <Text variant="body">{refund.reason}</Text>
          <Text variant="caption" color="muted" style={styles.askedAt}>
            Asked {formatLocal(refund.created_at)}
            {refund.acknowledged_at
              ? ` · acknowledged ${formatLocal(refund.acknowledged_at)}`
              : ''}
          </Text>
        </Card>
      </View>

      {/* ----------------------------------------------------- what they bought */}
      {subject === null ? null : refund.order ? (
        <OrderFacts refund={refund} />
      ) : (
        <BookingFacts refund={refund} />
      )}

      {/* -------------------------------------------------------- the money */}
      {subject !== null && amountLabel !== null ? (
        <FactList
          title="The refund"
          facts={[
            { label: 'They asked for', value: amountLabel, emphasis: true },
            { label: 'They paid', value: formatMoney(subject.total_cents, subject.currency) },
            {
              label: 'Paid by',
              value: railLabel(subject),
            },
          ]}
        />
      ) : null}

      {/* ------------------------------------------------------- the blocker */}
      {block !== null && !settled ? (
        <AdminNotice
          tone={block.code === 'no_money_taken' ? 'warning' : 'danger'}
          title={block.title}
          body={block.body}
          {...(block.source ? { source: block.source } : {})}
        />
      ) : null}

      {/* ----------------------------------------------- what already happened */}
      {/* The recorded decision, but only when it is not the one just made —
          `OutcomeNotice` below says the same thing from the server's own
          reply, and it is both fresher and more specific. */}
      {decidedEarlier && !decidedNow ? <SettledNotice refund={refund} /> : null}

      {/* ------------------------------------------------------- the outcome */}
      {outcome !== null ? <OutcomeNotice outcome={outcome} requesterName={requesterName} /> : null}
      {failure !== null && failure !== undefined ? (
        <FailureNotice error={failure} requesterName={requesterName} />
      ) : null}

      {/* ------------------------------------------------------- the choice */}
      {canApprove || canDecline ? (
        <View style={styles.actions}>
          {canApprove && amountLabel !== null ? (
            <Button
              label={`Approve — refund ${amountLabel}`}
              onPress={approve}
              loading={submitting}
              fullWidth
              accessibilityLabel={`Approve this refund and return ${amountLabel} to ${requesterName}`}
              accessibilityHint="Asks you to confirm, then returns the money to their original payment method"
            />
          ) : null}

          {canDecline ? (
            <Button
              label="Decline"
              variant="danger"
              onPress={onOpenDecline}
              disabled={submitting}
              fullWidth
              accessibilityLabel={`Decline this refund request from ${requesterName}`}
              accessibilityHint="Opens a form where you write the reason. They are shown it word for word."
            />
          ) : null}
        </View>
      ) : (
        <Button label="Back to the queue" variant="secondary" onPress={onBack} fullWidth />
      )}

      {/* --------------------------------------------------- everything else */}
      <View style={styles.links}>
        {refund.requester ? (
          <SearchEntry
            icon="person-outline"
            label={`Open ${requesterName}'s account`}
            hint="Their history, standing and other transactions"
            onPress={() => onOpenPerson(refund.requester?.id ?? '')}
          />
        ) : null}
        {counterpartyOf(refund) ? (
          <SearchEntry
            icon="storefront-outline"
            label={`Open ${counterpartyOf(refund)?.name}'s account`}
            hint="The other side of this transaction"
            onPress={() => onOpenPerson(counterpartyOf(refund)?.id ?? '')}
          />
        ) : null}
      </View>

      <DeclineSheet
        visible={declineOpen}
        onClose={onCloseDecline}
        submitting={submitting}
        error={failure}
        subject="refund request"
        consequence={DECLINE_CONSEQUENCE}
        {...(block?.code === 'store_rail' && subject
          ? { suggestion: storeDeclineDraft(subject, requesterName) }
          : {})}
        onSubmit={(reason) =>
          onDecide({ refundRequestId: refund.id, decision: 'decline', decisionNote: reason })
        }
      />
    </Screen>
  );
}

// -----------------------------------------------------------------------------
// The purchase
// -----------------------------------------------------------------------------

/**
 * The order behind the request.
 *
 * The event's own start time renders in the **event's** timezone — a gong bath
 * at 7pm in London is at 7pm in London whoever is deciding the refund — while
 * "purchased" renders in the operator's zone, because that is a platform
 * event and it is about them. Getting those two the wrong way round is the
 * classic marketplace bug and it would be an expensive one here: "the event
 * has not happened yet" is often the whole basis of the decision.
 */
function OrderFacts({ refund }: { refund: RefundForDecision }) {
  const order = refund.order;
  if (!order) return null;

  const badge = orderStatusBadge(order.status as OrderStatus);
  const event = order.event;
  const suffix = event ? timeZoneSuffix(event.timezone, event.starts_at) : null;

  const facts: Fact[] = [
    { label: 'Event', value: event?.title ?? 'Deleted since purchase' },
    { label: 'Host', value: event?.host?.display_name ?? 'Unknown' },
    {
      label: 'Event starts',
      value: event
        ? `${formatEventTime(event.starts_at, event.timezone)}${suffix ? ` ${suffix}` : ''}`
        : 'Unknown',
    },
    { label: 'Reference', value: order.reference },
    {
      label: 'Purchased',
      value: order.purchased_at ? formatLocal(order.purchased_at) : 'Never completed',
    },
    { label: 'Order status', value: badge.label, render: <Badge label={badge.label} tone={badge.tone} /> },
  ];

  return <FactList title="What they bought" facts={facts} />;
}

/**
 * The booking behind the request.
 *
 * `cancellation_window_hours` is read from the **booking**, never the service:
 * it is the snapshot taken at purchase, the service may have been edited
 * since, and policy §2.3 says undisclosed terms are not binding. On this
 * screen that is not trivia — it is frequently the deciding fact.
 */
function BookingFacts({ refund }: { refund: RefundForDecision }) {
  const booking = refund.booking;
  if (!booking) return null;

  const badge = bookingStatusBadge(booking.status as BookingStatus);
  const suffix = timeZoneSuffix(booking.timezone, booking.starts_at);

  const facts: Fact[] = [
    { label: 'Session', value: booking.service?.title ?? 'Deleted since booking' },
    { label: 'Practitioner', value: booking.provider?.display_name ?? 'Unknown' },
    {
      label: 'When',
      value: `${formatEventRange(booking.starts_at, booking.ends_at, booking.timezone)}${
        suffix ? ` ${suffix}` : ''
      }`,
    },
    { label: 'Reference', value: booking.reference },
    { label: 'Booked', value: formatLocal(booking.created_at) },
    {
      label: 'Free cancellation',
      value:
        booking.cancellation_window_hours === 0
          ? 'None offered'
          : `Up to ${booking.cancellation_window_hours}h before`,
    },
    {
      label: 'Booking status',
      value: badge.label,
      render: <Badge label={badge.label} tone={badge.tone} />,
    },
  ];

  return (
    <FactList title="What they booked" facts={facts}>
      {booking.seeker_note ? (
        <View style={styles.note}>
          <Text variant="caption" color="muted">
            Their note at booking
          </Text>
          <Text variant="bodySmall">{booking.seeker_note}</Text>
        </View>
      ) : null}
    </FactList>
  );
}

// -----------------------------------------------------------------------------
// Outcomes — nothing here is allowed to overstate what happened
// -----------------------------------------------------------------------------

/** A request that was already decided, by whoever decided it. */
function SettledNotice({ refund }: { refund: RefundForDecision }) {
  const by = refund.decided_by?.display_name;
  const when = refund.decided_at ? formatLocal(refund.decided_at) : null;

  if (refund.status === 'declined') {
    return (
      <AdminNotice
        tone="info"
        title="Already declined"
        body={[
          by ? `Declined by ${by}` : 'Declined',
          when ? ` on ${when}` : '',
          refund.decision_note ? `. Reason given: “${refund.decision_note}”` : '.',
        ].join('')}
      />
    );
  }

  return (
    <AdminNotice
      tone="success"
      title={refund.status === 'processed' ? 'Already refunded' : 'Already approved'}
      body={[
        by ? `Decided by ${by}` : 'Decided',
        when ? ` on ${when}` : '',
        refund.processed_at ? `. Money sent ${formatLocal(refund.processed_at)}.` : '.',
      ].join('')}
    />
  );
}

/**
 * What the server said actually happened.
 *
 * Built from the response, not from what was requested. `partial` and
 * `stripe_refund_id` come back from the function and both are reported: a
 * refund with no Stripe id did not reach Stripe, and saying "refunded" over
 * that would be the exact lie this screen exists to avoid.
 */
function OutcomeNotice({
  outcome,
  requesterName,
}: {
  outcome: RefundDecisionResult;
  requesterName: string;
}) {
  if (outcome.status === 'declined') {
    return (
      <AdminNotice
        tone="info"
        title="Declined, and they have been told"
        body={`${requesterName} has been sent your reason word for word. No money moved. ${
          outcome.escalation ?? ''
        }`.trim()}
      />
    );
  }

  const amount = outcome.amount_display ?? 'The refund';
  const reachedStripe = Boolean(outcome.stripe_refund_id);

  return (
    <AdminNotice
      tone={reachedStripe ? 'success' : 'warning'}
      title={reachedStripe ? `${amount} is on its way back` : 'Recorded, but check Stripe'}
      body={
        reachedStripe
          ? `${amount} was refunded to ${requesterName}'s original payment method${
              outcome.partial ? ' as a partial refund' : ''
            }. It usually reaches them in 5–10 business days, and they have been notified.`
          : `The request is settled but no Stripe refund id came back, so it is not confirmed that the money moved. Check the Stripe dashboard for ${outcome.subject ?? 'this transaction'} before telling anyone it is done.`
      }
      {...(outcome.stripe_refund_id ? { source: `Stripe refund ${outcome.stripe_refund_id}` } : {})}
    />
  );
}

/**
 * A failed decision, said plainly.
 *
 * The important case is `missing_configuration`: `STRIPE_SECRET_KEY` is not
 * set on the Edge Function, so `stripeClient()` throws *before* any row is
 * touched. Nothing was refunded, nothing was recorded and the customer was
 * sent nothing — and an operator who walks away believing otherwise is the
 * failure this whole screen is written against. The copy says all four things
 * in order.
 */
function FailureNotice({ error, requesterName }: { error: unknown; requesterName: string }) {
  const code = isAppError(error) ? error.code : undefined;
  const detail = isAppError(error) ? error.message : 'Something went wrong.';

  if (code === REFUND_ERROR.missingConfiguration) {
    return (
      <AdminNotice
        tone="danger"
        title="No money moved — nothing happened at all"
        body={`Stripe is not configured on the server, so the refund was never even attempted. The request is still open, nothing was recorded against it, and ${requesterName} has not been told anything. Do not tell them it is done. Someone needs to set STRIPE_SECRET_KEY before any refund can be approved.`}
        source={detail}
      />
    );
  }

  if (code === REFUND_ERROR.alreadyDecided) {
    return (
      <AdminNotice
        tone="warning"
        title="Someone decided this first"
        body="Another admin settled this request while you had it open. Go back and reload the queue — deciding it twice would refund the customer twice."
        source={detail}
      />
    );
  }

  if (code === REFUND_ERROR.storeRail) {
    return (
      <AdminNotice
        tone="danger"
        title="The store owns this money, not us"
        body="This purchase was paid through Apple or Google. Nothing was refunded and nothing changed. Decline it with a note pointing them at the store."
        source={detail}
      />
    );
  }

  if (code === REFUND_ERROR.noPaymentIntent || code === REFUND_ERROR.alreadyRefunded) {
    return <AdminNotice tone="danger" title="Nothing was refunded" body={detail} />;
  }

  return (
    <AdminNotice
      tone="danger"
      title="That did not go through"
      body={`${detail} Nothing was decided, and ${requesterName} has not been told anything.`}
    />
  );
}

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

/** How it was paid for, with the fact that changes the decision attached. */
function railLabel(subject: RefundSubject): string {
  if (subject.rail === 'apple_iap') return 'Apple in-app purchase';
  if (subject.rail === 'google_play') return 'Google Play';
  if (subject.payment_bypassed) return 'Test mode — no charge was made';
  return 'Card, via Stripe';
}

/** The other side of the transaction — the host, or the practitioner. */
function counterpartyOf(refund: RefundForDecision): { id: string; name: string } | null {
  const host = refund.order?.event?.host;
  if (host) return { id: host.id, name: host.display_name };

  const provider = refund.booking?.provider;
  if (provider) return { id: provider.id, name: provider.display_name };

  return null;
}

/**
 * A starting draft for the one decline whose wording is already decided.
 *
 * An Apple or Google purchase can only be refunded by the store, so the reply
 * is the same every time and there is no reason to make an operator retype it
 * under time pressure. It is loaded into the field for editing, never sent
 * automatically — the person who signs a decision should have read it.
 *
 */
function storeDeclineDraft(subject: RefundSubject, requesterName: string): string {
  const store = subject.rail === 'apple_iap' ? 'Apple' : 'Google Play';
  const where =
    subject.rail === 'apple_iap'
      ? 'reportaproblem.apple.com, or through Settings on your device'
      : 'the Google Play Store, under Order history';

  return (
    `Hello ${requesterName}, we are not able to refund this one ourselves. ` +
    `You paid for it through ${store}, which means ${store} took the payment and holds it — MSN never received it, ` +
    `so only ${store} can return it.\n\n` +
    `You can request the refund at ${where}. It is usually quick. ` +
    `We are sorry to send you elsewhere, and if ${store} turns it down please reply here and we will see what else we can do.`
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  personText: {
    flex: 1,
  },
  timing: {
    marginTop: spacing.sm,
    gap: spacing.xxs,
  },
  deadline: {
    lineHeight: 18,
  },
  section: {
    gap: spacing.xs,
  },
  askedAt: {
    marginTop: spacing.xs,
  },
  note: {
    marginTop: spacing.sm,
    gap: spacing.xxs,
  },
  actions: {
    gap: spacing.sm,
  },
  links: {
    gap: spacing.xxs,
  },
});
