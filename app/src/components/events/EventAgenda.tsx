import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import { formatEventClock, formatEventRange } from '@/lib/format';
import type { EventOccurrence } from '@/types/database';
import { iconSizes, MIN_TOUCH_TARGET, radii, spacing, useTheme } from '@/theme';

export interface EventAgendaProps {
  occurrences: readonly EventOccurrence[];
  /** The event's own zone. Occurrence times are the event's, not the viewer's. */
  timezone: string;
  /**
   * When true each date is a choice rather than an itinerary line, and the
   * chosen one is passed to `create-checkout` as `occurrence_id`.
   */
  selectable: boolean;
  selectedId: string | null;
  onSelect: (occurrenceId: string) => void;
  /** The screen's clock. See `use-now.ts` for why it is not read here. */
  now: number;
}

/**
 * The event's dates — an agenda for a multi-part event, a date picker for a
 * recurring one.
 *
 * `listEventOccurrences` already drops cancelled dates but not past ones, so
 * anything that has already ended is shown greyed and is not selectable: a
 * recurring series keeps its history, and letting someone buy into last
 * Tuesday is the sort of thing that only surfaces as a refund request.
 *
 * Selectable rows announce as radios, because exactly one date is chosen —
 * checkboxes would tell a screen-reader user they can pick several.
 */
export function EventAgenda({
  occurrences,
  timezone,
  selectable,
  selectedId,
  onSelect,
  now,
}: EventAgendaProps) {
  const theme = useTheme();

  return (
    <View style={styles.list}>
      {occurrences.map((occurrence) => {
        const isPast = Date.parse(occurrence.ends_at) <= now;
        const isSelected = occurrence.id === selectedId;
        const canSelect = selectable && !isPast;

        const timeLabel = formatEventRange(occurrence.starts_at, occurrence.ends_at, timezone);
        const label = isPast ? `${timeLabel}, past` : timeLabel;

        const content = (
          <>
            <Ionicons
              name={
                canSelect
                  ? isSelected
                    ? 'radio-button-on'
                    : 'radio-button-off'
                  : 'calendar-clear-outline'
              }
              size={iconSizes.md}
              color={
                isPast
                  ? theme.colors.textMuted
                  : isSelected
                    ? theme.colors.accent
                    : theme.colors.textSecondary
              }
            />
            <View style={styles.text}>
              <Text variant="bodySmall" color={isPast ? 'muted' : 'primary'}>
                {timeLabel}
              </Text>
              {occurrence.capacity !== null ? (
                // "Capacity N", not "N places": `event_occurrences.capacity` is
                // the room's size, and there is no per-occurrence sold counter
                // anywhere in the schema. `create-checkout` never reads this
                // column — a request for six tickets against a capacity of
                // three is accepted — so a bare "3 places" would read as three
                // remaining and be wrong. Remaining stock is `ticket_types`,
                // and it is pooled across every date.
                <Text variant="caption" color="muted">
                  Capacity {occurrence.capacity} ·{' '}
                  {formatEventClock(occurrence.starts_at, timezone)} start
                </Text>
              ) : null}
            </View>
            {isPast ? <Badge label="Past" tone="neutral" /> : null}
          </>
        );

        if (!canSelect) {
          return (
            <View key={occurrence.id} style={styles.row} accessible accessibilityLabel={label}>
              {content}
            </View>
          );
        }

        return (
          <Pressable
            key={occurrence.id}
            onPress={() => onSelect(occurrence.id)}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ selected: isSelected, checked: isSelected }}
            accessibilityHint="Chooses this date for your tickets"
            style={({ pressed }) => [
              styles.row,
              styles.selectable,
              {
                borderColor: isSelected ? theme.colors.accent : theme.colors.border,
                borderWidth: theme.borderWidths.hairline,
                backgroundColor: isSelected
                  ? theme.colors.accentSubtle
                  : pressed
                    ? theme.colors.surfaceSunken
                    : 'transparent',
              },
            ]}
          >
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
  },
  selectable: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.lg,
  },
  text: {
    flex: 1,
  },
});
