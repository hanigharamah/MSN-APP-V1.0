import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui';
import { borderWidths, radii, spacing, touchSlop, useTheme } from '@/theme';

const ITEM_HEIGHT = 36;

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  /** Names the group for screen readers, e.g. "Result type". */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Two-or-three-way switch between result sets.
 *
 * Modelled on `.my-booking-tabs` (`_base.scss:3208`), which DESIGN_SOURCE §5
 * calls the best pattern in the web codebase: a `surfaceMuted` track at pill
 * radius with a hairline border, and an active item that lifts onto the card
 * surface in the accent colour.
 *
 * The web renders its equivalent three times for three breakpoints and relies
 * on hover; here there is one instance and the idle-to-pressed transition
 * carries the feedback instead.
 *
 * Announced as a tab list rather than a set of buttons, because that is what
 * it is — one of N is always chosen, and a screen reader should say
 * "Practitioners, tab, 2 of 2" rather than offering two unrelated actions.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
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
            accessibilityState={{ selected }}
            hitSlop={{ top: touchSlop(ITEM_HEIGHT), bottom: touchSlop(ITEM_HEIGHT) }}
            style={({ pressed }) => [
              styles.item,
              selected
                ? {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  }
                : {
                    backgroundColor: pressed
                      ? theme.colors.accentSubtle
                      : theme.colors.surfaceMuted,
                    borderColor: 'transparent',
                  },
            ]}
          >
            {/* Same variant either way: the web's active tab steps 14/300 up
                to 14/600, but there is no 14-semibold token and swapping to a
                16px variant would resize the track under the user's finger.
                Fill and colour carry the state instead. */}
            <Text variant="bodySmall" color={selected ? 'accent' : 'secondary'} numberOfLines={1}>
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
    gap: spacing.xxs,
    padding: spacing.xxs,
    borderRadius: radii.pill,
    borderWidth: borderWidths.hairline,
  },
  item: {
    flex: 1,
    minHeight: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: borderWidths.hairline,
  },
});
