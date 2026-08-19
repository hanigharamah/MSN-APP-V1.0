import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { controlHeights, radii, spacing, useTheme } from '@/theme';
import { Text } from './Text';

/**
 * Variants map onto the web app's Bootstrap button set so the two read as one
 * product:
 *
 *   primary   -> `.btn-secondary`         filled magenta, white label
 *   secondary -> `.btn-outline-secondary` magenta outline on a tinted fill
 *   ghost     -> borderless, for toolbars and inline actions
 *   danger    -> filled, destructive only
 *
 * Heights come from `controlHeights` (`.btn { height: 44px }` in
 * `_layout.scss`), which is also the minimum accessible tap target — the two
 * happen to agree, so there is no tension to resolve.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks presses. The label stays, so width is stable. */
  loading?: boolean;
  disabled?: boolean;
  /** Fills the available width. Use for the primary action at the end of a form. */
  fullWidth?: boolean;
  /** Rendered before the label. Keep it to an icon. */
  icon?: ReactNode;
  /**
   * Screen-reader label. Needed when `label` is not self-explanatory out of
   * context — a "Book" button should announce "Book Sound Bath".
   */
  accessibilityLabel?: string;
  /** Explains the consequence, e.g. "Cancels your booking and opens a refund". */
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const HEIGHTS: Record<ButtonSize, number> = {
  /** Still 44 — `buttonSmall` (36) is below the accessible minimum, so the
   *  compact size gets its padding trimmed rather than its target. */
  sm: controlHeights.button,
  md: controlHeights.button,
  lg: 52,
};

const PADDING: Record<ButtonSize, number> = {
  sm: spacing.sm,
  md: spacing.lg,
  lg: spacing.xl,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const isInert = disabled || loading;

  const fills = (pressed: boolean): ViewStyle => {
    if (isInert) {
      return variant === 'ghost' || variant === 'secondary'
        ? { backgroundColor: 'transparent', borderColor: theme.colors.disabled }
        : { backgroundColor: theme.colors.disabled, borderColor: 'transparent' };
    }
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: pressed ? theme.colors.accentPressed : theme.colors.accent,
          borderColor: 'transparent',
        };
      case 'secondary':
        return {
          backgroundColor: pressed ? theme.colors.accentSubtlePressed : theme.colors.accentSubtle,
          borderColor: theme.colors.accent,
        };
      case 'ghost':
        return {
          backgroundColor: pressed ? theme.colors.accentSubtle : 'transparent',
          borderColor: 'transparent',
        };
      case 'danger':
        return {
          backgroundColor: pressed ? theme.colors.dangerSoft : theme.colors.danger,
          borderColor: 'transparent',
        };
    }
  };

  const labelColor = () => {
    if (isInert) return 'placeholder' as const;
    if (variant === 'primary' || variant === 'danger') return 'onAccent' as const;
    return 'accent' as const;
  };

  const containerStyle = ({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> => [
    styles.base,
    {
      minHeight: HEIGHTS[size],
      paddingHorizontal: PADDING[size],
      borderRadius: radii.lg,
      borderWidth: variant === 'secondary' ? theme.borderWidths.hairline : 0,
    },
    fills(pressed),
    fullWidth ? styles.fullWidth : null,
    style,
  ];

  return (
    <Pressable
      onPress={onPress}
      disabled={isInert}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      // `busy` is what makes a screen reader announce the loading state — a
      // spinner alone is invisible to it.
      accessibilityState={{ disabled: isInert, busy: loading }}
      testID={testID}
      style={containerStyle}
    >
      {loading ? (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator
            size="small"
            color={
              variant === 'primary' || variant === 'danger'
                ? theme.colors.textOnAccent
                : theme.colors.accent
            }
          />
        </View>
      ) : null}

      <View style={[styles.content, loading ? styles.hidden : null]}>
        {icon}
        {/* Two lines, not one. The height is `minHeight`, so the button grows
            with Dynamic Type — but a single line meant the LABEL ellipsised at
            large text sizes while the button around it got taller. Losing the
            words is 1.4.4; losing the layout is not. */}
        <Text variant="button" color={labelColor()} numberOfLines={2}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  // Kept mounted rather than removed so the button does not resize when it
  // starts loading — a button that shrinks under your finger mis-fires.
  hidden: {
    opacity: 0,
  },
  spinner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
