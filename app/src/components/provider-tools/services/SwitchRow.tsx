import { StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui';
import { MIN_TOUCH_TARGET, spacing, useTheme } from '@/theme';

export interface SwitchRowProps {
  label: string;
  /** One line on what turning it on actually does. */
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  /** Spoken after the label — the consequence, for a switch that has one. */
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A labelled boolean.
 *
 * There is no switch in `@/components/ui`, and this is not the place to add a
 * primitive to a design system owned by another pass — React Native's `Switch`
 * is a platform control rather than a competing button, so it is used directly
 * and themed from tokens.
 *
 * The row is a single accessible switch: the label and description are folded
 * into the control's own label, so a screen reader announces "Approve each
 * booking, switch, off" instead of stopping on three separate fragments and
 * leaving the user to guess which one the switch belongs to.
 */
export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  accessibilityHint,
  style,
  testID,
}: SwitchRowProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, style]}>
      <View style={styles.text} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text variant="bodyStrong" color={disabled ? 'muted' : 'primary'}>
          {label}
        </Text>
        {description ? (
          <Text variant="bodySmall" color="muted">
            {description}
          </Text>
        ) : null}
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={description ? `${label}. ${description}` : label}
        accessibilityHint={accessibilityHint}
        testID={testID}
        trackColor={{ false: theme.colors.borderStrong, true: theme.colors.accent }}
        thumbColor={theme.colors.surface}
        ios_backgroundColor={theme.colors.borderStrong}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
