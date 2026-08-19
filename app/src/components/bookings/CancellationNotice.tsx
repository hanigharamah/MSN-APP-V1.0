import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { borderWidths, iconSizes, radii, spacing, useTheme } from '@/theme';
import type { CancellationTerms } from './cancellation';

export interface CancellationNoticeProps {
  terms: CancellationTerms;
  /**
   * False once the booking is over or already cancelled — the policy is still
   * worth showing as a record, but "cancelling now costs you X" is nonsense
   * when there is nothing left to cancel.
   */
  showConsequence: boolean;
  viewerRole: 'seeker' | 'provider';
}

/**
 * The cancellation terms, stated as they apply *right now*.
 *
 * "Free cancellation up to 24 hours before" is the policy; "Free cancellation
 * until Tue 1 Sep, 2:00 PM" is the answer to the question the user is actually
 * asking. Both are shown, in that order.
 *
 * The window comes from `bookings.cancellation_window_hours` — the value
 * snapshotted when the seeker paid, not whatever the service says today. That
 * is the term they agreed to, and it is the only one that binds.
 */
export function CancellationNotice({ terms, showConsequence, viewerRole }: CancellationNoticeProps) {
  const theme = useTheme();

  const consequenceTone = terms.isFree ? 'muted' : terms.isWithinWindow ? 'success' : 'warning';

  return (
    <Card variant="outlined" style={styles.card}>
      <Text variant="h4" heading={2}>
        Cancellation
      </Text>

      <Text variant="bodySmall" color="secondary">
        {terms.policy}
        {viewerRole === 'seeker' ? ' — the terms you agreed when you booked.' : '.'}
      </Text>

      {showConsequence ? (
        <Text variant="bodyStrong" color={consequenceTone}>
          {terms.consequence}
        </Text>
      ) : null}

      {terms.isFree ? null : (
        <Text variant="bodySmall" color="muted">
          Cancelling releases the time slot and changes the booking&apos;s status. It does not move
          money on its own — a refund is a separate request.
        </Text>
      )}

      {terms.canRequestRefundInApp || terms.isFree ? null : (
        <View
          style={[
            styles.storeNotice,
            {
              backgroundColor: theme.colors.warningSubtle,
              borderColor: theme.colors.border,
              borderRadius: radii.lg,
            },
          ]}
        >
          <Ionicons
            name="information-circle-outline"
            size={iconSizes.md}
            color={theme.colors.warningText}
          />
          <Text variant="bodySmall" color="warning" style={styles.storeNoticeText}>
            {terms.storeRefundMessage}
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
  },
  storeNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    borderWidth: borderWidths.hairline,
    marginTop: spacing.xxs,
  },
  storeNoticeText: {
    flex: 1,
  },
});
