import { StyleSheet, View } from 'react-native';

import { availabilityOf, remainingStock } from '@/components/events';
import { Badge, Card, Text, type BadgeTone } from '@/components/ui';
import { formatEventTime, formatMoney } from '@/lib/format';
import { spacing } from '@/theme';
import type { TicketType } from '@/types/database';

export interface TicketTierRowProps {
  ticket: TicketType;
  /** The event's zone — the sale window is a wall-clock time in it. */
  timeZone: string;
  /**
   * The screen's clock, from `useNow()`. A prop rather than `Date.now()` in
   * render: the React Compiler is on for this app and `react-hooks/purity`
   * rejects an impure read during render, and one clock per screen is what
   * stops two rows disagreeing about whether sales have opened.
   */
  now: number;
  /** Set when this tier's currency differs from the event's other tiers. */
  currencyConflict?: boolean;
  onPress: () => void;
}

/**
 * One ticket tier, from the host's side.
 *
 * Shows what the buyer's row shows — price, stock, sale window — plus the two
 * things only a host cares about: whether the tier is active, and how many
 * have gone. Availability comes from the same `availabilityOf` the buyer's
 * screen uses, so a host and a customer can never read different states off
 * the same row.
 *
 * The price is formatted with the TIER's currency, never the event's. They are
 * different columns with no constraint between them, and printing a €15 tier
 * with the event's `GBP` produces a wrong price rather than a wrong label.
 */
export function TicketTierRow({
  ticket,
  timeZone,
  now,
  currencyConflict = false,
  onPress,
}: TicketTierRowProps) {
  const availability = availabilityOf(ticket, now);
  const remaining = remainingStock(ticket);

  const price =
    ticket.price_cents === 0 ? 'Free' : formatMoney(ticket.price_cents, ticket.currency);

  const stock =
    ticket.quantity === null
      ? `${ticket.quantity_sold} sold · unlimited`
      : `${ticket.quantity_sold} of ${ticket.quantity} sold · ${remaining ?? 0} left`;

  const status = statusBadgeFor(ticket, availability.kind);

  const window = (() => {
    const opens =
      ticket.sales_start_at === null
        ? null
        : `opens ${formatEventTime(ticket.sales_start_at, timeZone)}`;
    const closes =
      ticket.sales_end_at === null
        ? null
        : `closes ${formatEventTime(ticket.sales_end_at, timeZone)}`;
    const parts = [opens, closes].filter((part): part is string => part !== null);
    return parts.length === 0 ? 'On sale whenever the event is live' : `Sales ${parts.join(', ')}`;
  })();

  return (
    <Card
      variant="outlined"
      padding="sm"
      onPress={onPress}
      accessibilityLabel={`${ticket.name}. ${price}. ${stock}. ${status.label}`}
      accessibilityHint="Opens this tier for editing"
    >
      <View style={styles.header}>
        <Text variant="bodyStrong" numberOfLines={2} style={styles.name}>
          {ticket.name}
        </Text>
        <Text variant="bodyStrong" color="accent">
          {price}
        </Text>
      </View>

      {ticket.description ? (
        <Text variant="bodySmall" color="secondary" numberOfLines={2}>
          {ticket.description}
        </Text>
      ) : null}

      <Text variant="caption" color="muted">
        {stock} · up to {ticket.max_per_order} per order
      </Text>

      <Text variant="caption" color="muted">
        {window}
      </Text>

      <View style={styles.badges}>
        <Badge label={status.label} tone={status.tone} />
        {currencyConflict ? (
          <Badge label={`${ticket.currency.toUpperCase()} — mismatched`} tone="danger" />
        ) : null}
      </View>
    </Card>
  );
}

function statusBadgeFor(
  ticket: TicketType,
  kind: ReturnType<typeof availabilityOf>['kind'],
): { label: string; tone: BadgeTone } {
  if (!ticket.is_active) return { label: 'Inactive', tone: 'neutral' };

  switch (kind) {
    case 'on_sale':
      return { label: 'On sale', tone: 'success' };
    case 'not_yet_on_sale':
      return { label: 'Scheduled', tone: 'warning' };
    case 'sales_ended':
      return { label: 'Sales closed', tone: 'neutral' };
    case 'sold_out':
      return { label: 'Sold out', tone: 'danger' };
    case 'not_orderable':
      // In stock, in window, capped at zero per order. Worth naming, because
      // the row otherwise looks live and nothing can ever be bought.
      return { label: 'Not orderable', tone: 'danger' };
  }
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.xxs,
  },
  name: {
    flex: 1,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
