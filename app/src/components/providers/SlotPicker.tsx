import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { formatEventClock } from '@/lib/format';
import type { TimeSlot } from '@/lib/queries/services';
import { borderWidths, MIN_TOUCH_TARGET, radii, spacing, useTheme } from '@/theme';

export interface SlotPickerProps {
  slots: readonly TimeSlot[];
  /** UTC ISO of the chosen slot's start, or `null`. */
  selectedStartsAt: string | null;
  onSelect: (slot: TimeSlot) => void;
  /** The viewer's IANA zone — every button label is drawn in this zone. */
  viewerTimeZone: string;
  /** The practitioner's zone. A second line appears when it differs. */
  providerTimeZone: string;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  /**
   * Heading for the empty grid. Defaults to the per-day wording, which is only
   * honest when a day is actually selected — when the whole range is empty
   * there is no "this day" to speak of and the caller passes something else.
   */
  emptyTitle?: string;
  /** Shown in place of the grid when a day is picked but has nothing free. */
  emptyDescription?: string;
  /** Optional way out of the empty state, e.g. "Message the practitioner". */
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

/**
 * The slot grid.
 *
 * **Every option here comes from `getAvailableSlots`.** There is deliberately
 * no free-form time entry: `availability_blocks` and other people's `bookings`
 * are invisible to a seeker under RLS, so a client cannot tell a free hour from
 * an occupied one, and two seekers picking independently would both be offered
 * the same slot. The database generates the options and the database decides at
 * confirm time — this grid is a hint, not a guarantee, which is why the screen
 * handles a rejection at confirm and refreshes.
 *
 * Labels are in the **viewer's** zone. When the practitioner keeps a different
 * clock, their local time is printed under the selected slot by the screen, so
 * nobody agrees to a 3am call by accident.
 */
export function SlotPicker({
  slots,
  selectedStartsAt,
  onSelect,
  viewerTimeZone,
  providerTimeZone,
  isPending,
  isError,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
}: SlotPickerProps) {
  const theme = useTheme();

  if (isPending) {
    return (
      <View style={styles.grid} accessibilityLiveRegion="polite">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} width={96} height={MIN_TOUCH_TARGET} radius="lg" />
        ))}
      </View>
    );
  }

  if (isError) {
    return <ErrorState error={error} onRetry={onRetry} title="Could not load times" />;
  }

  if (slots.length === 0) {
    return (
      <EmptyState
        icon="calendar-outline"
        title={emptyTitle ?? 'No times on this day'}
        description={emptyDescription ?? 'Try another date — the strip above marks the days with openings.'}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }

  const crossZone = providerTimeZone !== viewerTimeZone;

  return (
    <View style={styles.grid}>
      {slots.map((slot) => {
        const selected = slot.startsAt === selectedStartsAt;
        const viewerClock = formatEventClock(slot.startsAt, viewerTimeZone);
        const providerClock = formatEventClock(slot.startsAt, providerTimeZone);

        return (
          <Pressable
            key={slot.startsAt}
            onPress={() => onSelect(slot)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={
              crossZone
                ? `${viewerClock} your time, ${providerClock} for the practitioner`
                : viewerClock
            }
            style={({ pressed }) => [
              styles.slot,
              {
                borderRadius: radii.lg,
                borderColor: selected ? theme.colors.accent : theme.colors.borderStrong,
                borderWidth: selected ? borderWidths.thick : borderWidths.hairline,
                backgroundColor: selected
                  ? theme.colors.accent
                  : pressed
                    ? theme.colors.accentSubtle
                    : theme.colors.surface,
              },
            ]}
          >
            {selected ? (
              <Ionicons name="checkmark" size={16} color={theme.colors.textOnAccent} />
            ) : null}
            <Text variant="bodyStrong" color={selected ? 'onAccent' : 'primary'}>
              {viewerClock}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  slot: {
    minWidth: 96,
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
  },
});
