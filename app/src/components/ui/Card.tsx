import type { ReactNode } from 'react';
import {
  Pressable,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { radii, spacing, useTheme, type SpacingToken } from '@/theme';

export interface CardProps {
  children: ReactNode;
  /** Makes the whole card a single tap target. */
  onPress?: () => void;
  /** `elevated` casts a shadow, `outlined` uses a border, `filled` neither. */
  variant?: 'elevated' | 'outlined' | 'filled';
  padding?: SpacingToken;
  /** Bumps `elevated` from the resting `card` shadow to `raised`. */
  raised?: boolean;
  /** Required when `onPress` is set — the card announces as one button. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The standard content container.
 *
 * `radii.lg` (8) is the house radius — 250 occurrences in the web app's
 * compiled utility classes, more than every other radius combined. Reserve
 * `radii.xxl` (16) for modals and hero panels.
 *
 * When `onPress` is given the card becomes ONE accessible button rather than a
 * container of separately-focusable pieces. That is almost always right for a
 * listing tile: a screen-reader user should hear "Sound Bath, Tuesday 1
 * September, $45, button", not five separate stops.
 */
export function Card({
  children,
  onPress,
  variant = 'elevated',
  padding = 'md',
  raised = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: CardProps) {
  const theme = useTheme();

  const base: ViewStyle = {
    backgroundColor: variant === 'filled' ? theme.colors.surfaceMuted : theme.colors.surface,
    borderRadius: radii.lg,
    padding: spacing[padding],
    borderWidth: variant === 'outlined' ? theme.borderWidths.hairline : 0,
    borderColor: theme.colors.border,
  };

  const shadow =
    variant === 'elevated'
      ? raised
        ? theme.shadows.raised
        : theme.shadows.card
      : theme.shadows.none;

  if (!onPress) {
    return (
      <View style={[base, shadow, style]} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }: PressableStateCallbackType) => [
        base,
        shadow,
        pressed ? { backgroundColor: theme.colors.surfaceSunken } : null,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
