import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Text, eventStatusBadge, type BadgeTone } from '@/components/ui';
import { formatEventRange, timeZoneSuffix } from '@/lib/format';
import type { TicketWithEvent } from '@/lib/queries/orders';
import { iconSizes, radii, spacing, useTheme } from '@/theme';

export interface TicketCardProps {
  ticket: TicketWithEvent;
  /**
   * Omitted when there is nowhere to go — the event embed comes back `null` if
   * the row was pulled or RLS stopped selecting it. A `Card` with `onPress`
   * announces as a button, so passing a no-op handler produces a control that
   * says "Opens the event" and then does nothing.
   */
  onPress?: () => void;
}

const THUMBNAIL = 56;

/**
 * An event ticket in the Bookings tab.
 *
 * The tab holds two different things — one-to-one bookings and tickets to
 * events — and a seeker does not think of them as different: both are "a thing
 * I am going to". They share the list and the Upcoming/Past segmentation, and
 * differ only in the badge and where tapping goes.
 *
 * TODO(agent · bookings): the door needs the QR, not the string. `tickets.code`
 * is what the scanner reads, and there is no QR renderer in `package.json` —
 * adding `react-native-qrcode-svg` (+ `react-native-svg`) is a dependency change
 * this agent was told not to make. Until then the code is shown as text, which
 * a host can type in manually but is not what anyone wants at a venue entrance.
 */
export function TicketCard({ ticket, onPress }: TicketCardProps) {
  const theme = useTheme();

  const event = ticket.event;
  const title = event?.title ?? 'Event';
  const suffix = event ? timeZoneSuffix(event.timezone, event.starts_at) : null;
  const when = event
    ? `${formatEventRange(event.starts_at, event.ends_at, event.timezone)}${suffix ? ` (${suffix})` : ''}`
    : 'Date unavailable';

  // An event that was called off matters more than the ticket's own state, so
  // it wins the badge slot.
  const badge: { label: string; tone: BadgeTone } =
    event && event.status === 'cancelled'
      ? eventStatusBadge(event.status)
      : ticket.checked_in_at
        ? { label: 'Checked in', tone: 'success' }
        : { label: 'Ticket', tone: 'accent' };

  return (
    <Card
      variant="outlined"
      padding="sm"
      {...(onPress
        ? {
            onPress,
            accessibilityLabel: `${title}. ${when}. ${badge.label}`,
            accessibilityHint: 'Opens the event',
          }
        : {})}
      style={{ borderRadius: radii.xxl }}
      testID={`ticket-card-${ticket.id}`}
    >
      <View style={styles.header}>
        {event?.cover_url ? (
          <Image
            source={{ uri: event.cover_url }}
            style={[styles.thumbnail, { backgroundColor: theme.colors.surfaceMuted }]}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : (
          <View
            style={[
              styles.thumbnail,
              styles.thumbnailFallback,
              { backgroundColor: theme.colors.surfaceMuted },
            ]}
          >
            <Ionicons name="ticket-outline" size={iconSizes.lg} color={theme.colors.textMuted} />
          </View>
        )}

        <View style={styles.headerText}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="bodySmall" color="secondary" numberOfLines={2}>
            {when}
          </Text>
          {event?.venue_name ? (
            <Text variant="caption" color="muted" numberOfLines={1}>
              {event.venue_name}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.footer}>
        <Badge label={badge.label} tone={badge.tone} />
        <Text variant="caption" color="muted" numberOfLines={1}>
          {ticket.code}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  thumbnail: {
    width: THUMBNAIL,
    height: THUMBNAIL,
    borderRadius: radii.lg,
  },
  thumbnailFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: spacing.xxs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
