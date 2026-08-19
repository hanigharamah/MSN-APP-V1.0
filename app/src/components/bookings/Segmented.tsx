import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui';
import { borderWidths, radii, spacing, useTheme } from '@/theme';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Announced after the label — "3 items", "shows requests waiting on you". */
  accessibilityHint?: string;
}

export interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Names the group for assistive tech, e.g. "Which bookings to show". */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The pill segmented control from the web app's `.my-booking-tabs`
 * (`_base.scss:3208`) — the best tab pattern in that codebase, and the one this
 * screen is named after.
 *
 *   track:  surfaceMuted, 4pt padding, pill radius, hairline border
 *   item:   pill, transparent
 *   active: surface fill, accent label, hairline border, subtle shadow
 *
 * Segments announce as tabs rather than buttons, because that is what they are:
 * one of N mutually exclusive views of the same list. A `Chip` would be wrong —
 * chips are independently togglable filters and announce as checkboxes.
 *
 * Each segment is 36pt tall inside a 4pt track, so the tap target is 44.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
  testID,
}: SegmentedProps<T>) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[
        styles.track,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
          borderRadius: radii.pill,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityHint={option.accessibilityHint}
            accessibilityState={{ selected }}
            hitSlop={{ top: spacing.xxs, bottom: spacing.xxs, left: 0, right: 0 }}
            style={({ pressed }) => [
              styles.item,
              {
                borderRadius: radii.pill,
                backgroundColor: selected
                  ? theme.colors.surface
                  : pressed
                    ? theme.colors.accentSubtle
                    : 'transparent',
                borderColor: selected ? theme.colors.border : 'transparent',
              },
              selected ? theme.shadows.subtle : null,
            ]}
          >
            <Text
              variant={selected ? 'bodyStrong' : 'bodySmall'}
              color={selected ? 'accent' : 'secondary'}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    padding: spacing.xxs,
    gap: spacing.xxs,
    borderWidth: borderWidths.hairline,
  },
  item: {
    minHeight: 36,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: borderWidths.hairline,
  },
});
