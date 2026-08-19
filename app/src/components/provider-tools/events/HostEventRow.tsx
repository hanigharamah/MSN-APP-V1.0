import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Text, eventStatusBadge } from '@/components/ui';
import { deliveryModeIcon, deliveryModeLabel } from '@/components/providers';
import { formatEventRange, timeZoneSuffix } from '@/lib/format';
import { spacing, useTheme } from '@/theme';
import type { EventRow } from '@/types/database';

export interface HostEventRowProps {
  event: EventRow;
  /** Total sold across every tier, or null while the count is still loading. */
  ticketsSold: number | null;
  onPress: () => void;
}

/**
 * One event in the host's own list.
 *
 * The date is rendered in the **event's** zone with `timeZoneSuffix` appended
 * when the host is somewhere else — a host in London managing a retreat in
 * Bali needs to see the Bali time, because that is the time on the ticket.
 *
 * `ticketsSold` is the sum of `quantity_sold` across the event's tiers, which
 * is an event-wide figure. A recurring event's dates share one pool; there is
 * deliberately no per-date breakdown here, because checkout does not enforce
 * one.
 *
 * The whole row is one accessible node: a screen-reader user should hear
 * "Sound Bath, Tuesday 1 September, draft, 12 sold, button", not five stops.
 */
export function HostEventRow({ event, ticketsSold, onPress }: HostEventRowProps) {
  const theme = useTheme();

  const status = eventStatusBadge(event.status);
  const suffix = timeZoneSuffix(event.timezone, event.starts_at);
  const when = `${formatEventRange(event.starts_at, event.ends_at, event.timezone)}${
    suffix ? ` (${suffix})` : ''
  }`;
  const sold =
    ticketsSold === null
      ? null
      : `${ticketsSold} ${ticketsSold === 1 ? 'ticket' : 'tickets'} sold`;

  return (
    <Card
      variant="outlined"
      padding="sm"
      onPress={onPress}
      accessibilityLabel={[event.title, when, status.label, sold].filter(Boolean).join('. ')}
      accessibilityHint="Opens this event for editing"
    >
      <View style={styles.header}>
        <Text variant="h4" numberOfLines={2} style={styles.title}>
          {event.title}
        </Text>
        <Badge label={status.label} tone={status.tone} />
      </View>

      <Text variant="bodySmall" color="secondary" numberOfLines={2}>
        {when}
      </Text>

      <View style={styles.meta}>
        <Ionicons
          name={deliveryModeIcon(event.delivery_mode)}
          size={16}
          color={theme.colors.textMuted}
        />
        <Text variant="caption" color="muted">
          {deliveryModeLabel(event.delivery_mode)}
        </Text>

        <Text variant="caption" color="muted">
          ·
        </Text>

        <Ionicons name="ticket-outline" size={16} color={theme.colors.textMuted} />
        <Text variant="caption" color={ticketsSold === null ? 'placeholder' : 'muted'}>
          {sold ?? 'Counting…'}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.xxs,
  },
  title: {
    flex: 1,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
});
