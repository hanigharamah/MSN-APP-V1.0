import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { formatEventDate, formatMoney } from '@/lib/format';
import { SCREEN_GUTTER, spacing, useTheme } from '@/theme';
import type { EventSaleState, PriceSummary, SelectionCurrency } from './ticket-availability';

/**
 * A reason checkout cannot be attempted at all, and the button label that says
 * so. Both halves are needed: the status line explains, the button names the
 * state, and a generic "Unavailable" on either would tell the customer nothing.
 */
export interface CheckoutBlock {
  /** The button's label. Short. */
  cta: string;
  /** The sentence on the status line. */
  message: string;
  /**
   * Leave unset for a refusal the viewer cannot do anything about — being the
   * host, or Apple's in-app-purchase rule. Set it when tapping resolves the
   * block, which today means only "you are signed out": the button stays live
   * and `onPress` takes them to sign in.
   */
  actionable?: boolean;
}

export interface CheckoutBarProps {
  saleState: EventSaleState;
  /** Headline price before anything is chosen: Free / Free + Paid / From $X. */
  priceSummary: PriceSummary;
  /**
   * The currency of the current selection. `mixed` means the chosen tiers are
   * priced in different currencies, which `create-checkout` refuses (422
   * `mixed_currency`) — there is no total to show and no order to place.
   */
  selectionCurrency: SelectionCurrency;
  /** The event's zone, for "Sales open …". */
  timezone: string;
  /** Shown on the left when the event is on sale and nothing is selected. */
  dateLine: string;
  selectedCount: number;
  /** Client-side estimate in integer cents. The server owns the real total. */
  subtotalCents: number;
  /** Recurring event with no date chosen yet. */
  needsDate: boolean;
  /**
   * Set when checkout cannot be attempted at all — the Apple in-app-purchase
   * rule, or the viewer being the host. Overrides every other state.
   */
  blocked: CheckoutBlock | null;
  onPress: () => void;
  /** Reports the rendered height so the scroll view can pad underneath it. */
  onHeightChange: (height: number) => void;
}

/**
 * The fixed bottom purchase bar.
 *
 * DESIGN_SOURCE §8: the web's booking panel is `position: sticky` on desktop,
 * which has no React Native equivalent — but the web already solves the phone
 * case itself, collapsing to `position: fixed; bottom: 49px` below 667px
 * (`_mobresponsive.scss:338`). That is the treatment ported here: an
 * absolutely-positioned bar pinned to the bottom of the screen, clearing the
 * safe-area inset rather than the web's hard-coded 49px tab bar.
 *
 * Edge-to-edge rather than the web's floating 94%-wide card: a native bottom
 * bar sits on the edge, and the inset card reads as a misplaced dialog on a
 * phone.
 *
 * The layout is the web's — status line left, price right, one full-width
 * primary button below — and so is the rule that the button has exactly one
 * label per state. Every "you cannot buy" case names itself.
 */
export function CheckoutBar({
  saleState,
  priceSummary,
  selectionCurrency,
  timezone,
  dateLine,
  selectedCount,
  subtotalCents,
  needsDate,
  blocked,
  onPress,
  onHeightChange,
}: CheckoutBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const copyInput: CopyInput = {
    saleState,
    selectedCount,
    subtotalCents,
    needsDate,
    blocked,
    timezone,
    selectionCurrency,
  };

  const cta = ctaFor(copyInput);
  const status = statusLineFor({ ...copyInput, dateLine });
  const price = priceLineFor({ priceSummary, selectionCurrency, selectedCount, subtotalCents });

  return (
    <View
      onLayout={(event) => onHeightChange(event.nativeEvent.layout.height)}
      style={[
        styles.bar,
        theme.shadows.raised,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          borderTopWidth: theme.borderWidths.hairline,
          paddingBottom: insets.bottom + spacing.sm,
        },
      ]}
    >
      <View style={styles.summary}>
        <Text variant="bodySmall" color="secondary" style={styles.status} numberOfLines={2}>
          {status}
        </Text>
        {price ? (
          <Text variant="bodyStrong" color="heading" numberOfLines={1}>
            {price}
          </Text>
        ) : null}
      </View>

      <Button
        label={cta.label}
        onPress={onPress}
        disabled={!cta.enabled}
        fullWidth
        accessibilityLabel={cta.label}
        accessibilityHint={cta.enabled ? 'Opens the checkout summary' : undefined}
      />
    </View>
  );
}

// -----------------------------------------------------------------------------
// State -> copy
// -----------------------------------------------------------------------------

interface CopyInput {
  saleState: EventSaleState;
  selectedCount: number;
  subtotalCents: number;
  needsDate: boolean;
  blocked: CheckoutBlock | null;
  timezone: string;
  selectionCurrency: SelectionCurrency;
}

function ctaFor({
  saleState,
  selectedCount,
  subtotalCents,
  needsDate,
  blocked,
  timezone,
  selectionCurrency,
}: CopyInput): { label: string; enabled: boolean } {
  // `actionable` blocks keep the button live. Signing out is the only one:
  // every other block is a fact about this viewer that tapping cannot change,
  // and an enabled button that can only fail is worse than a disabled one that
  // explains itself.
  if (blocked !== null) return { label: blocked.cta, enabled: blocked.actionable === true };

  switch (saleState.kind) {
    case 'unavailable':
      return { label: 'Not on sale', enabled: false };
    case 'event_passed':
      return { label: 'This event has ended', enabled: false };
    case 'no_tickets':
      return { label: 'No tickets yet', enabled: false };
    case 'sold_out':
      return { label: 'Sold out', enabled: false };
    case 'sales_ended':
      return { label: 'Ticket sales have ended', enabled: false };
    case 'not_yet_on_sale':
      return {
        label: `Sales open ${formatEventDate(saleState.opensAt, timezone)}`,
        enabled: false,
      };
    case 'open':
      if (needsDate) return { label: 'Choose a date', enabled: false };
      if (selectedCount === 0) return { label: 'Select tickets', enabled: false };
      // One payment cannot span two currencies, so this selection can never
      // become an order however many times it is tapped.
      if (selectionCurrency.kind === 'mixed') {
        return { label: 'Buy these separately', enabled: false };
      }
      if (subtotalCents === 0) {
        return {
          label: `Get ${selectedCount} free ${selectedCount === 1 ? 'ticket' : 'tickets'}`,
          enabled: true,
        };
      }
      return { label: 'Continue to checkout', enabled: true };
  }
}

function statusLineFor({
  saleState,
  selectedCount,
  subtotalCents,
  needsDate,
  blocked,
  dateLine,
  timezone,
  selectionCurrency,
}: CopyInput & { dateLine: string }): string {
  if (blocked !== null) return blocked.message;

  switch (saleState.kind) {
    case 'unavailable':
      return saleState.reason;
    case 'event_passed':
      return 'This event has already finished.';
    case 'no_tickets':
      return 'The host has not opened ticket sales.';
    case 'sold_out':
      return 'Every ticket type is sold out.';
    case 'sales_ended':
      return 'Ticket sales have closed.';
    case 'not_yet_on_sale':
      return `Sales open ${formatEventDate(saleState.opensAt, timezone)}`;
    case 'open': {
      if (needsDate) return 'Choose a date to continue';
      if (selectedCount === 0) return dateLine;
      if (selectionCurrency.kind === 'mixed') {
        return `These tickets are priced in ${selectionCurrency.currencies.join(' and ')}. One order cannot mix currencies — buy them in separate orders.`;
      }
      const count = `${selectedCount} ${selectedCount === 1 ? 'ticket' : 'tickets'} selected`;
      // The bar's figure is the ticket subtotal. The server adds its platform
      // fee (and any tax) on top and returns the real total before anything is
      // charged, so the number here must not read as the final price.
      return subtotalCents === 0 ? count : `${count} · fees added at checkout`;
    }
  }
}

function priceLineFor({
  priceSummary,
  selectionCurrency,
  selectedCount,
  subtotalCents,
}: {
  priceSummary: PriceSummary;
  selectionCurrency: SelectionCurrency;
  selectedCount: number;
  subtotalCents: number;
}): string | null {
  if (selectedCount > 0) {
    // Adding a £28 line to a €15 line produces a number that is not an amount
    // in either currency. Print nothing rather than a plausible wrong total —
    // the status line carries the explanation.
    if (selectionCurrency.kind === 'mixed') return null;
    if (subtotalCents === 0) return 'Free';
    if (selectionCurrency.kind !== 'single') return null;
    return formatMoney(subtotalCents, selectionCurrency.currency);
  }

  switch (priceSummary.kind) {
    case 'none':
      return null;
    case 'free':
      return 'Free';
    case 'free_and_paid':
      return `Free + from ${formatMoney(priceSummary.fromCents, priceSummary.currency, { compact: true })}`;
    case 'from':
      return `From ${formatMoney(priceSummary.fromCents, priceSummary.currency, { compact: true })}`;
  }
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  status: {
    flex: 1,
  },
});
