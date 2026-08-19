import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { borderWidths, SCREEN_GUTTER, spacing, useTheme } from '@/theme';

export interface BookingActionBarProps {
  /** `'$45'` — the left-hand figure. */
  priceLabel: string;
  /** One line under the price: the chosen time, or what to do next. */
  caption: string;
  buttonLabel: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Shown above the bar in danger colour. Clears when the user re-picks. */
  error?: string | null;
  /** Explains what confirming commits the user to. */
  accessibilityHint?: string;
}

/**
 * The bottom booking bar.
 *
 * The web app's sticky panel becomes `position: fixed; bottom: 49px` below
 * 667px (`_mobresponsive.scss:338`), clearing its mobile tab bar. DESIGN_SOURCE
 * §8 says to port that treatment rather than the desktop sticky: here it is an
 * absolutely-positioned bar respecting the safe-area inset, with the hardcoded
 * 49px replaced by the real inset. This screen is in the modal stack, so there
 * is no tab bar underneath it.
 */
export function BookingActionBar({
  priceLabel,
  caption,
  buttonLabel,
  onPress,
  disabled = false,
  loading = false,
  error,
  accessibilityHint,
}: BookingActionBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        theme.shadows.raised,
        {
          backgroundColor: theme.colors.surfaceElevated,
          borderTopColor: theme.colors.borderStrong,
          paddingBottom: insets.bottom + spacing.sm,
        },
      ]}
    >
      {error ? (
        <Text
          variant="bodySmall"
          color="danger"
          style={styles.error}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}

      <View style={styles.row}>
        <View style={styles.summary}>
          <Text variant="h4">{priceLabel}</Text>
          <Text variant="bodySmall" color="muted" numberOfLines={2}>
            {caption}
          </Text>
        </View>

        <Button
          label={buttonLabel}
          onPress={onPress}
          disabled={disabled}
          loading={loading}
          accessibilityHint={accessibilityHint}
          style={styles.button}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: borderWidths.hairline,
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.sm,
  },
  error: {
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summary: {
    flex: 1,
  },
  button: {
    minWidth: 140,
  },
});
