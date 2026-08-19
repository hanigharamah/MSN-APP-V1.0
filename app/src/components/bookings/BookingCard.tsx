import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Avatar, Badge, Card, Text, bookingStatusBadgeFor } from '@/components/ui';
import { formatDuration, formatEventRange, formatMoney, timeZoneSuffix } from '@/lib/format';
import type { BookingWithParties } from '@/lib/queries/bookings';
import { iconSizes, radii, spacing, useTheme } from '@/theme';
import type { DeliveryMode } from '@/types/database';

export interface BookingCardProps {
  booking: BookingWithParties;
  /** Which side of this booking the viewer is on. Decides whose name shows. */
  viewerRole: 'seeker' | 'provider';
  onPress: () => void;
}

const MODE_ICON: Record<DeliveryMode, keyof typeof Ionicons.glyphMap> = {
  in_person: 'location-outline',
  online_live: 'videocam-outline',
  one_to_one: 'videocam-outline',
};

const MODE_LABEL: Record<DeliveryMode, string> = {
  in_person: 'In person',
  online_live: 'Online',
  one_to_one: 'Online',
};

/**
 * One booking in the Bookings tab.
 *
 * Follows the web app's list-row card (`Cards/BookedEventCardListView.vue`):
 * radius 16, 12pt padding, status pill. Grid cards keep radius 8; list rows are
 * the 16 case (DESIGN_SOURCE.md §5).
 *
 * The whole row is ONE accessible button with a composed label. A seeker
 * scrolling this list with VoiceOver should hear "Sound Bath with Maya Okonjo,
 * Tuesday 1 September 9:00 AM, confirmed, $45" as a single stop — not five.
 *
 * Times render in the BOOKING's `timezone`, never the device's. A session at
 * 9am in Bali is at 9am in Bali whoever is looking; the zone suffix appears
 * only when the viewer is somewhere else.
 */
export function BookingCard({ booking, viewerRole, onPress }: BookingCardProps) {
  const theme = useTheme();

  const counterparty = viewerRole === 'seeker' ? booking.provider : booking.seeker;
  const counterpartyName = counterparty?.display_name ?? 'Someone';
  const title = booking.service?.title ?? 'Session';
  const status = bookingStatusBadgeFor(booking.status, viewerRole);

  const suffix = timeZoneSuffix(booking.timezone, booking.starts_at);
  const when = `${formatEventRange(booking.starts_at, booking.ends_at, booking.timezone)}${
    suffix ? ` (${suffix})` : ''
  }`;

  const mode = booking.service?.delivery_mode ?? null;
  const duration = booking.service?.duration_minutes ?? null;
  const price = formatMoney(booking.total_cents, booking.currency);

  const withLine =
    viewerRole === 'seeker' ? `with ${counterpartyName}` : `for ${counterpartyName}`;

  return (
    <Card
      variant="outlined"
      padding="sm"
      onPress={onPress}
      style={{ borderRadius: radii.xxl }}
      accessibilityLabel={`${title} ${withLine}. ${when}. ${status.label}. ${price}`}
      accessibilityHint="Opens the booking"
      testID={`booking-card-${booking.id}`}
    >
      <View style={styles.header}>
        <Avatar uri={counterparty?.avatar_url} name={counterpartyName} size="md" />

        <View style={styles.headerText}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="bodySmall" color="secondary" numberOfLines={1}>
            {withLine}
          </Text>
        </View>

        <Text variant="bodyStrong" color="heading">
          {price}
        </Text>
      </View>

      <View style={styles.meta}>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={iconSizes.xs} color={theme.colors.textMuted} />
          <Text variant="bodySmall" color="secondary" numberOfLines={1} style={styles.metaText}>
            {when}
          </Text>
        </View>

        {mode ? (
          <View style={styles.metaRow}>
            <Ionicons name={MODE_ICON[mode]} size={iconSizes.xs} color={theme.colors.textMuted} />
            <Text variant="bodySmall" color="secondary" numberOfLines={1} style={styles.metaText}>
              {MODE_LABEL[mode]}
              {duration === null ? '' : ` · ${formatDuration(duration)}`}
            </Text>
          </View>
        ) : null}
      </View>

      <Badge label={status.label} tone={status.tone} style={styles.badge} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    gap: spacing.xxs,
  },
  meta: {
    gap: spacing.xxs,
    marginTop: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    flex: 1,
  },
  badge: {
    marginTop: spacing.sm,
  },
});
