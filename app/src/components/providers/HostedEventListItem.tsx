import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Text, eventStatusBadge } from '@/components/ui';
import { formatEventRange, timeZoneSuffix } from '@/lib/format';
import type { EventRow } from '@/types/database';
import { radii, spacing, useTheme } from '@/theme';
import { deliveryModeIcon, deliveryModeLabel } from './labels';

const THUMB = 72;

export interface HostedEventListItemProps {
  event: EventRow;
  onPress: () => void;
  /** Shows the draft/cancelled pill. Only meaningful on your own profile. */
  showStatus?: boolean;
}

/**
 * An event this profile hosts.
 *
 * The time is rendered in the **event's** zone, not the viewer's — a retreat
 * that starts at 9am in Bali starts at 9am in Bali whoever is looking — with
 * `timeZoneSuffix` appended only when the viewer is somewhere else. That is the
 * opposite of the slot picker, where the viewer's clock is what matters,
 * because an event is a place you go and a session is a meeting you join.
 */
export function HostedEventListItem({
  event,
  onPress,
  showStatus = false,
}: HostedEventListItemProps) {
  const theme = useTheme();

  const suffix = timeZoneSuffix(event.timezone, event.starts_at);
  const when = `${formatEventRange(event.starts_at, event.ends_at, event.timezone)}${
    suffix ? ` (${suffix})` : ''
  }`;
  // No price here on purpose: `events` has no price column — the numbers live
  // on `ticket_types`, which this row does not load. "From $X" would mean
  // fetching a ticket list per card, so the card states the fact it has.
  const status = eventStatusBadge(event.status);

  return (
    <Card
      variant="outlined"
      onPress={onPress}
      padding="sm"
      accessibilityLabel={`${event.title}. ${when}. ${deliveryModeLabel(event.delivery_mode)}`}
      accessibilityHint="Opens the event"
    >
      <View style={styles.row}>
        <View style={[styles.thumb, { backgroundColor: theme.colors.surfaceMuted }]}>
          {event.cover_url ? (
            <Image
              source={{ uri: event.cover_url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Ionicons name="calendar-outline" size={24} color={theme.colors.textMuted} />
          )}
        </View>

        <View style={styles.text}>
          <Text variant="h4" numberOfLines={2}>
            {event.title}
          </Text>

          <Text variant="bodySmall" color="secondary" numberOfLines={2}>
            {when}
          </Text>

          <View style={styles.meta}>
            <Ionicons
              name={deliveryModeIcon(event.delivery_mode)}
              size={16}
              color={theme.colors.textMuted}
            />
            <Text variant="bodySmall" color="muted" numberOfLines={1}>
              {deliveryModeLabel(event.delivery_mode)}
            </Text>
          </View>

          <View style={styles.footer}>
            <Text variant="bodyStrong" color="accent">
              {event.is_free ? 'Free' : 'Ticketed'}
            </Text>
            {showStatus ? <Badge label={status.label} tone={status.tone} /> : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radii.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
});
