import { StyleSheet, View } from 'react-native';

import { Badge, Text, type BadgeTone } from '@/components/ui';
import { formatEventDate, formatPrice } from '@/lib/format';
import type { TicketType } from '@/types/database';
import { radii, spacing, useTheme } from '@/theme';
import { QuantityStepper } from './QuantityStepper';
import { availabilityOf, type TicketAvailability } from './ticket-availability';

/** Below this, remaining stock is called out as urgency rather than hidden. */
const LOW_STOCK_THRESHOLD = 10;

/**
 * Above this, the per-order cap is not worth a line. Nobody buying two tickets
 * is surprised that the stepper stops at fifty; someone buying four for their
 * family and finding it stops at three very much is.
 */
const MAX_PER_ORDER_WORTH_SAYING = 20;

export interface TicketTypeRowProps {
  ticket: TicketType;
  /** The event's zone — sale windows are the event's schedule, not the viewer's. */
  timezone: string;
  quantity: number;
  onChangeQuantity: (next: number) => void;
  /**
   * False when something outside this ticket type blocks buying: no date
   * chosen on a recurring event, or the whole event routed to a payment rail
   * the app cannot use yet. The row still shows its price and stock.
   */
  purchasable: boolean;
  /** The screen's clock, so every row and the bottom bar agree. */
  now: number;
  /**
   * Whether the event runs on more than one date.
   *
   * `ticket_types.quantity` is a single pool for the whole event, while
   * `event_occurrences.capacity` is per date — so on a recurring event
   * "Only 3 left" is three across the entire series, not three on the date the
   * customer just picked. The wording has to say which, or the number reads as
   * a promise about one evening that nothing in the schema is making.
   */
  isRecurring?: boolean;
}

/**
 * One ticket type: what it is, what it costs, whether it can be bought, and a
 * stepper when it can.
 *
 * Every "cannot buy" case gets its own sentence. "Sold out", "Sales open Fri
 * 12 Sep" and "Sales ended" are three different pieces of news and a single
 * greyed-out row tells the customer none of them.
 */
export function TicketTypeRow({
  ticket,
  timezone,
  quantity,
  onChangeQuantity,
  purchasable,
  now,
  isRecurring = false,
}: TicketTypeRowProps) {
  const theme = useTheme();
  const availability = availabilityOf(ticket, now);
  const status = statusFor(availability, timezone);
  const canBuy = purchasable && availability.kind === 'on_sale' && availability.maxSelectable > 0;

  const price = formatPrice(ticket.price_cents, ticket.currency);

  return (
    <View
      style={[
        styles.row,
        {
          borderColor: quantity > 0 ? theme.colors.accent : theme.colors.border,
          borderWidth: theme.borderWidths.hairline,
          backgroundColor: quantity > 0 ? theme.colors.accentSubtle : theme.colors.surface,
        },
      ]}
    >
      <View style={styles.details}>
        <Text variant="bodyStrong">{ticket.name}</Text>

        {ticket.description ? (
          <Text variant="bodySmall" color="secondary" style={styles.description}>
            {ticket.description}
          </Text>
        ) : null}

        <Text variant="bodyStrong" color="accent" style={styles.price}>
          {price}
        </Text>

        <View style={styles.meta}>
          {status ? <Badge label={status.label} tone={status.tone} /> : null}
          {canBuy && availability.kind === 'on_sale' ? (
            <TicketStock
              availability={availability}
              maxPerOrder={ticket.max_per_order}
              isRecurring={isRecurring}
            />
          ) : null}
        </View>
      </View>

      {canBuy && availability.kind === 'on_sale' ? (
        <QuantityStepper
          value={quantity}
          max={availability.maxSelectable}
          onChange={onChangeQuantity}
          label={`${ticket.name}, ${price}`}
        />
      ) : null}
    </View>
  );
}

interface TicketStockProps {
  availability: Extract<TicketAvailability, { kind: 'on_sale' }>;
  maxPerOrder: number;
  isRecurring: boolean;
}

/**
 * The quiet line under a buyable ticket. Remaining stock is only named when it
 * is low enough to matter — "412 left" is noise, "Only 3 left" is a decision.
 *
 * Two things it must not do:
 *
 *   - Imply that the remaining count belongs to one date. It does not: the pool
 *     is `ticket_types.quantity` for the whole event, and nothing in the schema
 *     or in `create-checkout` decrements per occurrence.
 *   - Leave the per-order cap unsaid. The stepper stops dead at
 *     `max_per_order` and a stepper that stops without a reason reads as a bug,
 *     so the cap is named whenever it is the thing doing the stopping.
 */
function TicketStock({ availability, maxPerOrder, isRecurring }: TicketStockProps) {
  const { remaining, maxSelectable } = availability;

  const parts: string[] = [];

  if (remaining !== null && remaining <= LOW_STOCK_THRESHOLD) {
    parts.push(isRecurring ? `Only ${remaining} left across all dates` : `Only ${remaining} left`);
  }

  if (maxSelectable < maxPerOrder) {
    // Stock, not the host's cap, is what is limiting this order.
    if (parts.length === 0) {
      parts.push(isRecurring ? `${maxSelectable} available in total` : `${maxSelectable} available`);
    }
  } else if (maxPerOrder <= MAX_PER_ORDER_WORTH_SAYING) {
    // The host's cap, not stock, is what stops the stepper here.
    parts.push(`Max ${maxPerOrder} per order`);
  }

  if (parts.length === 0) return null;

  return (
    <Text variant="caption" color="muted">
      {parts.join(' · ')}
    </Text>
  );
}

function statusFor(
  availability: TicketAvailability,
  timezone: string,
): { label: string; tone: BadgeTone } | null {
  switch (availability.kind) {
    case 'sold_out':
      return { label: 'Sold out', tone: 'neutral' };
    case 'not_yet_on_sale':
      return {
        label: `Sales open ${formatEventDate(availability.opensAt, timezone)}`,
        tone: 'warning',
      };
    case 'sales_ended':
      return { label: 'Sales ended', tone: 'neutral' };
    case 'not_orderable':
      // In stock, in window, but `max_per_order` is 0. Saying "sold out" would
      // be a lie and saying nothing leaves a row that looks broken.
      return { label: 'Not on sale', tone: 'neutral' };
    case 'on_sale':
      return null;
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.lg,
  },
  details: {
    flex: 1,
  },
  description: {
    marginTop: spacing.xxs,
  },
  price: {
    marginTop: spacing.xxs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
