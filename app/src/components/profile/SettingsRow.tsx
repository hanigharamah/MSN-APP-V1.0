import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import { borderWidths, iconSizes, spacing, useTheme } from '@/theme';

export interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Trailing value — a status, a count, a current setting. */
  value?: string;
  /** Small pill after the label. `Soon` for anything not built yet. */
  badge?: string;
  onPress?: () => void;
  /** Renders inert and greyed. Use with `badge` so the reason is visible. */
  disabled?: boolean;
  /** Sign out, delete account — tints the label and icon. */
  destructive?: boolean;
  /** Required on anything destructive: say what will happen. */
  accessibilityHint?: string;
  /** Last row in its group — drops the divider. */
  last?: boolean;
}

/**
 * One row in a settings or tools group.
 *
 * The whole row is a single button with one composed label. An icon, a title, a
 * trailing value and a chevron are four visual elements and one idea, and a
 * screen reader should hear the idea.
 *
 * A disabled row still announces its label and its badge, so "My services,
 * Soon, dimmed" is a comprehensible answer rather than a control that appears
 * to do nothing.
 */
export function SettingsRow({
  icon,
  label,
  value,
  badge,
  onPress,
  disabled = false,
  destructive = false,
  accessibilityHint,
  last = false,
}: SettingsRowProps) {
  const theme = useTheme();

  const inert = disabled || onPress === undefined;
  const tint = disabled
    ? theme.colors.textPlaceholder
    : destructive
      ? theme.colors.dangerText
      : theme.colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityState={{ disabled: inert }}
      accessibilityLabel={[label, badge, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomWidth: last ? 0 : borderWidths.hairline,
          borderBottomColor: theme.colors.border,
          backgroundColor: pressed && !inert ? theme.colors.surfaceMuted : 'transparent',
        },
      ]}
    >
      <Ionicons name={icon} size={iconSizes.md} color={tint} />

      <View style={styles.labelWrap}>
        <Text
          variant="body"
          color={disabled ? 'placeholder' : destructive ? 'danger' : 'primary'}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>

      {badge ? <Badge label={badge} tone="neutral" /> : null}

      {value ? (
        <Text variant="bodySmall" color="muted" numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}

      {!inert ? (
        <Ionicons name="chevron-forward" size={iconSizes.md} color={theme.colors.textMuted} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    // The design system's minimum tap target, applied to the row rather than
    // to the chevron inside it.
    minHeight: 52,
    paddingVertical: spacing.xs,
  },
  labelWrap: {
    flex: 1,
  },
  value: {
    maxWidth: 140,
    textAlign: 'right',
  },
});
