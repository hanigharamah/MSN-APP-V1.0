import { StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/ui';
import { MIN_TOUCH_TARGET, spacing, useTheme } from '@/theme';

export interface ToggleRowProps {
  label: string;
  /** What being on or off actually does. Not optional — every switch here has a
   *  consequence a practitioner would want stated before they flip it. */
  description: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  /** Blocks interaction and shows the current value while a write is in flight. */
  busy?: boolean;
  testID?: string;
}

/**
 * A labelled switch.
 *
 * The UI kit has no toggle, and the web app has no equivalent control to port —
 * it uses checkboxes in forms. React Native's `Switch` is the right answer
 * anyway: it is the platform control, so it inherits the platform's own
 * accessibility behaviour, and it is the affordance both OSes use for a setting
 * that takes effect immediately, which is exactly what these do.
 *
 * The whole row is one accessible node, so VoiceOver reads "Accepting bookings,
 * switch, on" and the consequence in the hint, rather than stopping twice.
 */
export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  busy = false,
  testID,
}: ToggleRowProps) {
  const theme = useTheme();
  const isInert = disabled || busy;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: value, disabled: isInert, busy }}
    >
      <View style={styles.text}>
        <Text variant="bodyStrong" color={isInert ? 'muted' : 'primary'}>
          {label}
        </Text>
        <Text variant="bodySmall" color="secondary">
          {description}
        </Text>
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={isInert}
        testID={testID}
        // Hidden from assistive tech because the wrapping row already announces
        // as a switch — otherwise every setting is two stops that say the same
        // thing.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        trackColor={{ false: theme.colors.surfaceSunken, true: theme.colors.accent }}
        thumbColor={theme.colors.surface}
        ios_backgroundColor={theme.colors.surfaceSunken}
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
    paddingVertical: spacing.xxs,
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
});
