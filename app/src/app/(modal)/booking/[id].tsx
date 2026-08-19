import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import {
  BookingActions,
  BookingPartyRow,
  CancellationNotice,
  MeetingLinkCard,
  cancellationTermsFor,
  hasEnded,
  isTerminalBooking,
} from '@/components/bookings';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  Skeleton,
  Text,
  bookingStatusBadgeFor,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import {
  deviceTimeZone,
  formatDuration,
  formatEventRange,
  formatLocal,
  formatMoney,
  timeZoneSuffix,
} from '@/lib/format';
import { getBooking } from '@/lib/queries/bookings';
import { qk } from '@/lib/queries/keys';
import { spacing } from '@/theme';
import type { DeliveryMode } from '@/types/database';

const MODE_LABEL: Record<DeliveryMode, string> = {
  in_person: 'In person',
  online_live: 'Online — live session',
  one_to_one: 'Online — one to one',
};

/**
 * =============================================================================
 * Booking detail
 * =============================================================================
 *
 * The record of an agreement between two people, shown to both of them. Which
 * side the viewer is on comes from the row itself — `provider_id === me` — not
 * from the account type, because a practitioner books other practitioners and
 * would otherwise see the wrong set of buttons on their own bookings.
 *
 * Three things this screen is careful about:
 *
 *   1. **Times render in the booking's zone**, with the viewer's zone spelled
 *      out underneath when the two differ. Getting this wrong is the classic
 *      marketplace bug and it is worst here, where someone acts on it.
 *   2. **The cancellation window comes from the booking**, never the service.
 *      See `components/bookings/cancellation.ts`.
 *   3. **Cancelling is not a refund.** The status and the money are two
 *      separate calls, and on a store rail the second one is not ours to make.
 */
export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? '';

  const { data, isPending, isError, error, refetch, isRefetching } = useQuery({
    queryKey: qk.bookings.detail(id),
    queryFn: () => getBooking(id),
    enabled: Boolean(id),
  });

  if (isPending) {
    return (
      <Screen scroll safeBottom>
        <View accessibilityLiveRegion="polite" accessibilityLabel="Loading this booking">
          <Skeleton height={24} width="40%" />
          <Skeleton height={28} width="80%" style={styles.skeletonGap} />
          <Skeleton height={16} width="60%" style={styles.skeletonGap} />
          <Skeleton height={140} radius="lg" style={styles.skeletonBlock} />
          <Skeleton height={120} radius="lg" style={styles.skeletonBlock} />
        </View>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen>
        <EmptyState
          icon="calendar-outline"
          title="Booking not found"
          description="You may no longer have access to this booking."
          actionLabel="See your bookings"
          onAction={() => router.replace('/(tabs)/bookings')}
        />
      </Screen>
    );
  }

  const viewerRole: 'seeker' | 'provider' = data.provider_id === viewerId ? 'provider' : 'seeker';
  const status = bookingStatusBadgeFor(data.status, viewerRole);
  const terms = cancellationTermsFor(data);

  const bookingZoneSuffix = timeZoneSuffix(data.timezone, data.starts_at);
  const viewerZoneSuffix = timeZoneSuffix(deviceTimeZone(), data.starts_at, data.timezone);

  const mode = data.service?.delivery_mode ?? null;
  const duration = data.service?.duration_minutes ?? null;

  // The terms are still worth reading on a closed booking, but "cancelling now
  // costs you X" is meaningless once there is nothing left to cancel.
  const showConsequence = !isTerminalBooking(data.status) && !hasEnded(data);

  return (
    <Screen
      scroll
      safeBottom
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    >
      {/* --- What and when ------------------------------------------------- */}
      <View style={styles.summary}>
        <Badge label={status.label} tone={status.tone} />

        <Text variant="h3" heading={1}>
          {data.service?.title ?? 'Session'}
        </Text>

        <Text variant="bodyStrong" color="primary">
          {formatEventRange(data.starts_at, data.ends_at, data.timezone)}
          {bookingZoneSuffix ? ` (${bookingZoneSuffix})` : ''}
        </Text>

        {/* Only when the viewer is somewhere else — "9:00 AM PDT" is noise if
            you are in California. */}
        {bookingZoneSuffix ? (
          <Text variant="bodySmall" color="secondary">
            {`Your time: ${formatLocal(data.starts_at)}${viewerZoneSuffix ? ` (${viewerZoneSuffix})` : ''}`}
          </Text>
        ) : null}

        <Text variant="bodySmall" color="secondary">
          {[mode ? MODE_LABEL[mode] : null, duration === null ? null : formatDuration(duration)]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>

      {/* --- Who ----------------------------------------------------------- */}
      <Card variant="outlined" style={styles.card}>
        <Text variant="h4" heading={2}>
          Who
        </Text>

        <BookingPartyRow
          role={viewerRole === 'provider' ? 'Practitioner (you)' : 'Practitioner'}
          name={data.provider?.display_name ?? 'Practitioner'}
          avatarUrl={data.provider?.avatar_url}
          handle={data.provider?.handle}
          isVerified={data.provider?.is_verified ?? false}
          {...(viewerRole === 'seeker' && data.provider
            ? {
                onPress: () =>
                  router.push({ pathname: '/provider/[id]', params: { id: data.provider_id } }),
              }
            : {})}
        />

        <BookingPartyRow
          role={viewerRole === 'seeker' ? 'Seeker (you)' : 'Seeker'}
          name={data.seeker?.display_name ?? 'Seeker'}
          avatarUrl={data.seeker?.avatar_url}
          handle={data.seeker?.handle}
          {...(viewerRole === 'provider' && data.seeker
            ? {
                onPress: () =>
                  router.push({ pathname: '/provider/[id]', params: { id: data.seeker_id } }),
              }
            : {})}
        />
      </Card>

      {/* --- Joining ------------------------------------------------------- */}
      <MeetingLinkCard booking={data} viewerRole={viewerRole} />

      {/* --- Notes --------------------------------------------------------- */}
      {data.seeker_note || data.provider_note ? (
        <Card variant="outlined" style={styles.card}>
          <Text variant="h4" heading={2}>
            Notes
          </Text>

          {data.seeker_note ? (
            <View style={styles.note}>
              <Text variant="caption" color="muted">
                {viewerRole === 'seeker' ? 'Your note' : 'From the seeker'}
              </Text>
              <Text variant="bodySmall">{data.seeker_note}</Text>
            </View>
          ) : null}

          {data.provider_note ? (
            <View style={styles.note}>
              <Text variant="caption" color="muted">
                {viewerRole === 'provider' ? 'Your note' : 'From the practitioner'}
              </Text>
              <Text variant="bodySmall">{data.provider_note}</Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* --- Payment ------------------------------------------------------- */}
      <Card variant="outlined" style={styles.card}>
        <Text variant="h4" heading={2}>
          Payment
        </Text>

        <View style={styles.paymentRow}>
          <Text variant="bodySmall" color="secondary">
            Total
          </Text>
          <Text variant="bodyStrong">{formatMoney(data.total_cents, data.currency)}</Text>
        </View>

        <View style={styles.paymentRow}>
          <Text variant="bodySmall" color="secondary">
            Reference
          </Text>
          <Text variant="bodySmall" selectable>
            {data.reference}
          </Text>
        </View>
      </Card>

      {/* --- Cancellation and refunds -------------------------------------- */}
      <CancellationNotice terms={terms} showConsequence={showConsequence} viewerRole={viewerRole} />

      {/* --- Actions -------------------------------------------------------- */}
      <BookingActions booking={data} viewerRole={viewerRole} viewerId={viewerId} terms={terms} />

      {/*
        TODO(agent · bookings): the seeker's review prompt for a `completed`
        booking is missing, and deliberately not faked with a dead button. Two
        pieces do not exist yet and both are outside this agent's files:

          1. `createReview` in `lib/queries/profiles.ts`. `reviews` has SELECT
             helpers only. The insert must carry this `booking_id` —
             `review_needs_transaction` rejects a review with neither an
             `order_id` nor a `booking_id`, so there is no drive-by rating.
          2. A route to write it in, e.g. `(modal)/review/[bookingId].tsx`,
             registered in `(modal)/_layout.tsx`.

        With those in place this is a `status === 'completed' && viewerRole ===
        'seeker'` card with a star row and a "Write a review" button, placed
        above `BookingActions`.
      */}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  summary: {
    gap: spacing.xs,
  },
  card: {
    gap: spacing.xs,
  },
  note: {
    gap: spacing.xxs,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  skeletonGap: {
    marginTop: spacing.xs,
  },
  skeletonBlock: {
    marginTop: spacing.md,
  },
});
