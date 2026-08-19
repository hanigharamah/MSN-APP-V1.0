import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { Text } from '@/components/ui';
import { iconSizes, MIN_TOUCH_TARGET, radii, useTheme } from '@/theme';

export interface QuantityStepperProps {
  value: number;
  /** Hard ceiling: `min(max_per_order, remaining stock)`. */
  max: number;
  min?: number;
  onChange: (next: number) => void;
  /** What is being counted, e.g. "General admission". Announced with the value. */
  label: string;
  disabled?: boolean;
}

/**
 * Minus / count / plus.
 *
 * Announced as one `adjustable` control rather than three separate stops, so
 * VoiceOver and TalkBack expose their native increment/decrement gestures and
 * read "General admission, 2" instead of "minus button, 2, plus button". The
 * two `Pressable`s stay tappable for everyone else — the container being
 * `accessible` hides them from assistive tech only.
 *
 * The component never decides the ceiling itself. `max` comes from
 * `availabilityOf()`, which is where `max_per_order` and remaining stock are
 * reconciled.
 */
export function QuantityStepper({
  value,
  max,
  min = 0,
  onChange,
  label,
  disabled = false,
}: QuantityStepperProps) {
  const canDecrement = !disabled && value > min;
  const canIncrement = !disabled && value < max;

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment' && canIncrement) onChange(value + 1);
    if (event.nativeEvent.actionName === 'decrement' && canDecrement) onChange(value - 1);
  };

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: `${value} selected` }}
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={handleAccessibilityAction}
    >
      <StepperButton
        icon="remove"
        enabled={canDecrement}
        onPress={() => onChange(value - 1)}
        label={`Remove one ${label}`}
      />
      <Text variant="bodyStrong" align="center" style={styles.value}>
        {value}
      </Text>
      <StepperButton
        icon="add"
        enabled={canIncrement}
        onPress={() => onChange(value + 1)}
        label={`Add one ${label}`}
      />
    </View>
  );
}

interface StepperButtonProps {
  icon: 'add' | 'remove';
  enabled: boolean;
  onPress: () => void;
  label: string;
}

function StepperButton({ icon, enabled, onPress, label }: StepperButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      style={({ pressed }) => [
        styles.button,
        {
          borderColor: enabled ? theme.colors.accent : theme.colors.disabled,
          borderWidth: theme.borderWidths.hairline,
          backgroundColor:
            pressed && enabled ? theme.colors.accentSubtlePressed : theme.colors.surface,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={iconSizes.md}
        color={enabled ? theme.colors.accent : theme.colors.disabledText}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  button: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    minWidth: 40,
  },
});
