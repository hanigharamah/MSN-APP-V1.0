import { StyleSheet, View } from 'react-native';

import { Chip, Text } from '@/components/ui';
import { spacing } from '@/theme';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
}

export interface ChoiceFieldProps<T extends string> {
  label: string;
  value: T | null;
  options: readonly ChoiceOption<T>[];
  onChange: (value: T) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Adds an "Any" chip that clears the selection. For optional choices. */
  onClear?: () => void;
  clearLabel?: string;
}

/**
 * Single-select, as a wrapping row of chips.
 *
 * A native picker would be a `Modal` per field and a dropdown does not exist
 * in React Native; for the handful of options these fields have (three
 * delivery modes, a dozen categories) chips are one tap instead of three and
 * show every option without opening anything.
 *
 * The label mirrors `Input`'s — same typography, same required asterisk, same
 * error placement — so a form mixing the two lines up.
 */
export function ChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  required = false,
  onClear,
  clearLabel = 'Any',
}: ChoiceFieldProps<T>) {
  return (
    <View>
      <Text variant="bodySmall" color="secondary" style={styles.label}>
        {label}
        {required ? (
          <Text variant="bodySmall" color="danger">
            {' *'}
          </Text>
        ) : null}
      </Text>

      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {onClear ? (
          <Chip
            label={clearLabel}
            selected={value === null}
            onPress={onClear}
            accessibilityHint={`Clears ${label.toLowerCase()}`}
          />
        ) : null}

        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={option.value === value}
            onPress={() => onChange(option.value)}
            accessibilityHint={`Sets ${label.toLowerCase()} to ${option.label}`}
          />
        ))}
      </View>

      {error ? (
        <Text variant="caption" color="danger" style={styles.helper}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="muted" style={styles.helper}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  helper: {
    marginTop: spacing.xxs,
  },
});
