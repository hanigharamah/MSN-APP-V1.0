import type { ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { borderWidths, MIN_TOUCH_TARGET, radii, spacing, useTheme } from '@/theme';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  /** Selected chips fill with the accent tint and read as "selected". */
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  /** Rendered before the label. Keep it to a small icon. */
  icon?: ReactNode;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A filter or tag chip — the interactive sibling of `Badge`.
 *
 * Rendered as a checkbox to assistive tech rather than a button, because that
 * is what a filter row is: several independently togglable states, not several
 * actions. VoiceOver then announces "Sound Healing, checkbox, selected", which
 * tells the user what tapping will do.
 *
 * A chip is visually ~32pt tall but `hitSlop` takes the tap target to 44.
 */
export function Chip({
  label,
  selected = false,
  onPress,
  disabled = false,
  icon,
  accessibilityHint,
  style,
  testID,
}: ChipProps) {
  const theme = useTheme();

  const background = disabled
    ? theme.colors.disabled
    : selected
      ? theme.colors.accentSubtle
      : theme.colors.surface;

  const border = disabled
    ? theme.colors.disabled
    : selected
      ? theme.colors.accent
      : theme.colors.borderStrong;

  const slop = Math.ceil((MIN_TOUCH_TARGET - 32) / 2);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || onPress === undefined}
      hitSlop={{ top: slop, bottom: slop, left: 0, right: 0 }}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked: selected, disabled }}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: pressed && !disabled ? theme.colors.accentSubtlePressed : background,
          borderColor: border,
          borderRadius: radii.lg,
        },
        style,
      ]}
    >
      {icon}
      <Text
        variant="label"
        color={disabled ? 'placeholder' : selected ? 'accent' : 'secondary'}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderWidth: borderWidths.hairline,
  },
});
