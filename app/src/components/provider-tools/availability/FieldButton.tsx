import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { borderWidths, controlHeights, iconSizes, radii, spacing, useTheme } from '@/theme';

export interface FieldButtonProps {
  /** Always visible, like `Input`'s label — a placeholder-only field loses its
   *  name the moment it has a value. */
  label: string;
  value: string;
  /** One line under the control: an offset, a consequence, a hint. */
  hint?: string;
  error?: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Announced instead of `label, value` when that would be ambiguous. */
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * A read-only field that opens a picker.
 *
 * Shaped like `Input` on purpose — same 46pt height, same 4pt radius, same
 * always-visible label, same red 2pt border when invalid (DESIGN_SOURCE §5
 * "Inputs") — because it sits in the same forms and a control that looks
 * different reads as a different kind of thing.
 *
 * Not added to `@/components/ui`: this pass does not own that folder. If a
 * second feature needs it, that is the moment to promote it rather than copy it.
 */
export function FieldButton({
  label,
  value,
  hint,
  error,
  onPress,
  disabled = false,
  icon,
  accessibilityLabel,
  testID,
}: FieldButtonProps) {
  const theme = useTheme();
  const invalid = error !== undefined;

  return (
    <View style={styles.container}>
      <Text variant="label" color="secondary">
        {label}
      </Text>

      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
        accessibilityHint="Opens a list to choose from"
        accessibilityState={{ disabled }}
        testID={testID}
        style={({ pressed }) => [
          styles.control,
          {
            borderRadius: radii.sm,
            borderWidth: invalid ? borderWidths.thick : borderWidths.hairline,
            borderColor: invalid
              ? theme.colors.dangerBorder
              : disabled
                ? theme.colors.disabled
                : theme.colors.border,
            backgroundColor: disabled
              ? theme.colors.surfaceMuted
              : pressed
                ? theme.colors.surfaceSunken
                : theme.colors.surface,
          },
        ]}
      >
        {icon === undefined ? null : (
          <Ionicons
            name={icon}
            size={iconSizes.md}
            color={disabled ? theme.colors.textPlaceholder : theme.colors.textMuted}
          />
        )}
        <Text
          variant="body"
          color={disabled ? 'placeholder' : 'primary'}
          numberOfLines={1}
          style={styles.value}
        >
          {value}
        </Text>
        <Ionicons
          name="chevron-down"
          size={iconSizes.sm}
          color={disabled ? theme.colors.textPlaceholder : theme.colors.textMuted}
        />
      </Pressable>

      {invalid ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint === undefined ? null : (
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xxs,
  },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: controlHeights.input,
    paddingHorizontal: spacing.sm,
  },
  value: {
    flex: 1,
  },
});
