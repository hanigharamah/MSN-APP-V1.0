import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { borderWidths, radii, spacing, useTheme } from '@/theme';
import type { AccountType } from '@/types/database';
import { isProviderAccount } from '@/types/database';
import type { AccountActivity } from './admin-queries';

export interface ActivityPanelProps {
  activity: AccountActivity;
  accountType: AccountType;
}

interface Stat {
  key: string;
  label: string;
  value: string;
  /** Sub-line under the number. Keep it to a few words. */
  note?: string;
}

/**
 * What this account has actually done on the marketplace.
 *
 * Counts, not lists. The operator is deciding about a person, and a page of
 * every booking they have ever taken buries the three numbers the decision
 * turns on: have they delivered anything, do they have anything live, and is
 * anyone currently waiting on them.
 *
 * Which stats appear depends on the account type. A seeker has no services and
 * showing them "0 services" implies a gap where there is not one — but the
 * provider block still renders for a seeker who somehow has provider-side rows,
 * because that discrepancy is exactly the sort of thing an operator is looking
 * at this screen to find.
 */
export function ActivityPanel({ activity, accountType }: ActivityPanelProps) {
  const theme = useTheme();

  const hasProviderSide =
    isProviderAccount(accountType) ||
    activity.bookingsAsProvider > 0 ||
    activity.eventsHosted > 0 ||
    activity.servicesListed > 0;

  const stats: Stat[] = [];

  if (hasProviderSide) {
    stats.push(
      {
        key: 'delivered',
        label: 'Sessions delivered',
        value: String(activity.completedAsProvider),
        note: `of ${activity.bookingsAsProvider} booked`,
      },
      {
        key: 'events',
        label: 'Events',
        value: String(activity.eventsHosted),
        note: `${activity.eventsPublished} live`,
      },
      {
        key: 'services',
        label: 'Services',
        value: String(activity.servicesListed),
        note: `${activity.servicesActive} active`,
      },
      {
        key: 'reviews',
        label: 'Reviews received',
        value: String(activity.reviewsReceived),
      },
    );
  }

  stats.push(
    {
      key: 'booked',
      label: 'Sessions booked',
      value: String(activity.bookingsAsSeeker),
      note: 'as a seeker',
    },
    {
      key: 'orders',
      label: 'Ticket orders',
      value: String(activity.ordersPlaced),
      note: 'paid',
    },
    {
      key: 'upcoming',
      label: 'Upcoming bookings',
      value: String(activity.upcomingBookings),
      note: 'either side, not yet held',
    },
  );

  return (
    <Card variant="outlined" style={styles.card}>
      <Text variant="h4" heading={2}>
        Activity
      </Text>

      <View style={styles.grid}>
        {stats.map((stat) => (
          <View
            key={stat.key}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${stat.label}: ${stat.value}${stat.note ? `, ${stat.note}` : ''}`}
            style={[
              styles.cell,
              {
                backgroundColor: theme.colors.surfaceMuted,
                borderColor: theme.colors.border,
                borderWidth: borderWidths.hairline,
                borderRadius: radii.lg,
              },
            ]}
          >
            <Text variant="h3">{stat.value}</Text>
            <Text variant="caption" color="secondary" numberOfLines={2}>
              {stat.label}
            </Text>
            {stat.note ? (
              <Text variant="caption" color="muted" numberOfLines={1}>
                {stat.note}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  cell: {
    // Three-ish per row on a phone, two on a narrow one, without measuring.
    flexGrow: 1,
    flexBasis: 96,
    padding: spacing.sm,
    gap: spacing.xxs,
  },
});
