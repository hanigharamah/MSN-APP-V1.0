import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Skeleton, Text } from '@/components/ui';
import type { TicketType } from '@/types/database';
import { iconSizes, radii, spacing, useTheme } from '@/theme';
import { TicketTypeRow } from './TicketTypeRow';
import type { TicketSelection } from './ticket-availability';
import { quantityFor } from './ticket-availability';

export interface TicketListProps {
  tickets: readonly TicketType[];
  /** The event's zone. Sale windows belong to the event, not the viewer. */
  timezone: string;
  selection: TicketSelection;
  onChangeQuantity: (ticket: TicketType, quantity: number) => void;
  /**
   * Non-null when checkout cannot be attempted for this event at all. The
   * ticket types are still listed — the customer is entitled to see what the
   * event costs even when this build cannot sell it to them.
   */
  blockedReason: string | null;
  /** Recurring event with no date chosen yet. */
  needsDate: boolean;
  /** The screen's clock, so the rows and the bottom bar agree on sale windows. */
  now: number;
  /**
   * Whether the event runs on several dates. Changes how remaining stock is
   * worded — the pool is event-wide, not per date. See `TicketTypeRow`.
   */
  isRecurring?: boolean;
}

export function TicketList({
  tickets,
  timezone,
  selection,
  onChangeQuantity,
  blockedReason,
  needsDate,
  now,
  isRecurring = false,
}: TicketListProps) {
  const purchasable = blockedReason === null && !needsDate;

  return (
    <View style={styles.list}>
      {blockedReason !== null ? (
        <Notice icon="information-circle-outline" text={blockedReason} tone="warning" />
      ) : needsDate ? (
        <Notice
          icon="calendar-outline"
          text="Choose a date above, then pick your tickets."
          tone="neutral"
        />
      ) : null}

      {tickets.map((ticket) => (
        <TicketTypeRow
          key={ticket.id}
          ticket={ticket}
          timezone={timezone}
          quantity={quantityFor(selection, ticket.id)}
          onChangeQuantity={(quantity) => onChangeQuantity(ticket, quantity)}
          purchasable={purchasable}
          now={now}
          isRecurring={isRecurring}
        />
      ))}
    </View>
  );
}

function Notice({
  icon,
  text,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  tone: 'warning' | 'neutral';
}) {
  const theme = useTheme();
  const background = tone === 'warning' ? theme.colors.warningSubtle : theme.colors.surfaceMuted;
  const foreground = tone === 'warning' ? theme.colors.warningText : theme.colors.textSecondary;

  return (
    <View
      style={[styles.notice, { backgroundColor: background }]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={text}
    >
      <Ionicons name={icon} size={iconSizes.md} color={foreground} style={styles.noticeIcon} />
      <Text variant="bodySmall" color={tone === 'warning' ? 'warning' : 'secondary'} style={styles.noticeText}>
        {text}
      </Text>
    </View>
  );
}

/** Pending branch, shaped like two ticket rows so the section does not jump. */
export function TicketListSkeleton() {
  return (
    <View style={styles.list}>
      <Skeleton height={96} radius="lg" />
      <Skeleton height={96} radius="lg" />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
  },
  notice: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.lg,
  },
  noticeIcon: {
    marginTop: 2,
  },
  noticeText: {
    flex: 1,
  },
});
