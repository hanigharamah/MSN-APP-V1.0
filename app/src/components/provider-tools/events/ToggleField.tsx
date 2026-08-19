import { StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/ui';
import { MIN_TOUCH_TARGET, spacing, useTheme } from '@/theme';

export interface ToggleFieldProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** What being on actually means. Worth a line on every one of these. */
  description?: string;
  disabled?: boolean;
}

/**
 * A labelled switch.
 *
 * The row is one accessible node with `role="switch"`, so a screen reader
 * announces "Free event, switch, off" instead of stopping on the label and the
 * control separately. `Switch` itself is left out of the accessibility tree for
 * the same reason.
 */
export function ToggleField({
  label,
  value,
  onChange,
  description,
  disabled = false,
}: ToggleFieldProps) {
  const theme = useTheme();

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled }}
    >
      <View style={styles.text}>
        <Text variant="body" color={disabled ? 'muted' : 'primary'}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color="muted">
            {description}
          </Text>
        ) : null}
      </View>

      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
        thumbColor={theme.colors.surface}
        ios_backgroundColor={theme.colors.border}
        accessibilityElementsHidden
        importantForAccessibility="no"
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
    gap: spacing.xxs,
  },
});
