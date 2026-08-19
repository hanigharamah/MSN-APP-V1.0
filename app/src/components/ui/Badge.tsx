import { View, type StyleProp, type ViewStyle } from 'react-native';

import { radii, spacing, useTheme, type ColorTokenName } from '@/theme';
import type { BookingStatus, EventStatus, OrderStatus, RefundStatus } from '@/types/database';
import { Text } from './Text';

/**
 * A small non-interactive status label. If it can be tapped it is a `Chip`,
 * not a `Badge`.
 */
export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const TONE_FILL: Record<BadgeTone, ColorTokenName> = {
  neutral: 'surfaceMuted',
  accent: 'accentSubtle',
  success: 'successSubtle',
  warning: 'warningSubtle',
  danger: 'dangerSubtle',
};

const TONE_TEXT = {
  neutral: 'secondary',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
} as const;

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          paddingHorizontal: spacing.xs,
          paddingVertical: spacing.xxs,
          borderRadius: radii.sm,
          backgroundColor: theme.colors[TONE_FILL[tone]],
        },
        style,
      ]}
    >
      <Text variant="label" color={TONE_TEXT[tone]}>
        {label}
      </Text>
    </View>
  );
}

// -----------------------------------------------------------------------------
// Status mappings
// -----------------------------------------------------------------------------
// One place where a database enum becomes a label and a colour. Put every
// status badge through these — the same status must never appear as
// "Cancelled" on one screen and "Called off" on another, which is exactly the
// inconsistency the single-status-column schema decision was meant to end.

export function eventStatusBadge(status: EventStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'draft':
      return { label: 'Draft', tone: 'neutral' };
    case 'published':
      return { label: 'Live', tone: 'success' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'danger' };
    case 'completed':
      return { label: 'Finished', tone: 'neutral' };
    case 'archived':
      return { label: 'Archived', tone: 'neutral' };
  }
}

export function bookingStatusBadge(status: BookingStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'requested':
      return { label: 'Awaiting confirmation', tone: 'warning' };
    case 'confirmed':
      return { label: 'Confirmed', tone: 'success' };
    case 'declined':
      return { label: 'Declined', tone: 'danger' };
    case 'cancelled_by_seeker':
      return { label: 'Cancelled by you', tone: 'neutral' };
    case 'cancelled_by_provider':
      return { label: 'Cancelled by host', tone: 'danger' };
    case 'completed':
      return { label: 'Completed', tone: 'neutral' };
    case 'no_show':
      return { label: 'No show', tone: 'danger' };
  }
}

export function orderStatusBadge(status: OrderStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'pending':
      return { label: 'Pending', tone: 'warning' };
    case 'paid':
      return { label: 'Paid', tone: 'success' };
    case 'failed':
      return { label: 'Payment failed', tone: 'danger' };
    case 'refunded':
      return { label: 'Refunded', tone: 'neutral' };
    case 'partially_refunded':
      return { label: 'Partly refunded', tone: 'neutral' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'neutral' };
  }
}

export function refundStatusBadge(status: RefundStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'requested':
      return { label: 'Under review', tone: 'warning' };
    case 'approved':
      return { label: 'Approved', tone: 'success' };
    case 'declined':
      return { label: 'Declined', tone: 'danger' };
    case 'processed':
      return { label: 'Refunded', tone: 'success' };
  }
}

/**
 * `bookingStatusBadge` returns "Cancelled by you" from the seeker's point of
 * view. Flip it when rendering the provider's list.
 */
export function bookingStatusBadgeFor(
  status: BookingStatus,
  viewerRole: 'seeker' | 'provider',
): { label: string; tone: BadgeTone } {
  const base = bookingStatusBadge(status);
  if (viewerRole === 'provider') {
    if (status === 'cancelled_by_seeker') return { label: 'Cancelled by seeker', tone: 'danger' };
    if (status === 'cancelled_by_provider') return { label: 'Cancelled by you', tone: 'neutral' };
  }
  return base;
}
