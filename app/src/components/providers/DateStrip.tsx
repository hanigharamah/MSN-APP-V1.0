import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { borderWidths, radii, spacing, useTheme } from '@/theme';
import type { DayOption } from './booking-time';

const CELL_WIDTH = 60;
const CELL_HEIGHT = 72;

export interface DateStripProps {
  days: readonly DayOption[];
  /** `null` before anything is chosen and while slots are still loading. */
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** How many slots each day has. A day missing from the map has none. */
  slotCountByDay: ReadonlyMap<string, number>;
  /** Dims and disables every cell — used while the slot query is in flight. */
  loading?: boolean;
}

/**
 * The horizontal date strip above the slot picker.
 *
 * Days are the **viewer's** days. `available_slots` walks the provider's days,
 * so the counts here come from re-bucketing its result in the viewer's zone
 * (`groupSlotsByDay`) rather than from the RPC's own day boundaries — otherwise
 * a seeker eight hours behind their practitioner sees slots filed under the
 * wrong date.
 *
 * A day with no slots is disabled rather than hidden. A gap in the strip reads
 * as a rendering fault; a greyed-out Tuesday reads as "not this Tuesday".
 */
export function DateStrip({
  days,
  selectedKey,
  onSelect,
  slotCountByDay,
  loading = false,
}: DateStripProps) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      accessibilityRole="tablist"
    >
      {days.map((day) => {
        const count = slotCountByDay.get(day.key) ?? 0;
        const disabled = loading || count === 0;
        const selected = day.key === selectedKey;

        return (
          <Pressable
            key={day.key}
            onPress={() => onSelect(day.key)}
            disabled={disabled}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`${day.weekday} ${day.dayOfMonth} ${day.month}`}
            accessibilityHint={
              disabled
                ? 'No times available on this day'
                : `${count} ${count === 1 ? 'time' : 'times'} available`
            }
            style={({ pressed }) => [
              styles.cell,
              {
                borderRadius: radii.lg,
                borderColor: selected ? theme.colors.accent : theme.colors.border,
                backgroundColor: selected
                  ? theme.colors.accent
                  : pressed
                    ? theme.colors.accentSubtle
                    : theme.colors.surface,
                opacity: disabled ? theme.opacities.disabled : 1,
              },
            ]}
          >
            <Text variant="caption" color={selected ? 'onAccent' : 'muted'}>
              {day.isToday ? 'Today' : day.weekday}
            </Text>
            <Text variant="h4" color={selected ? 'onAccent' : 'primary'}>
              {day.dayOfMonth}
            </Text>
            <Text variant="caption" color={selected ? 'onAccent' : 'muted'}>
              {day.month}
            </Text>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    count === 0
                      ? 'transparent'
                      : selected
                        ? theme.colors.textOnAccent
                        : theme.colors.accent,
                },
              ]}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: {
    gap: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  cell: {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidths.hairline,
    gap: 1,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
  },
});
