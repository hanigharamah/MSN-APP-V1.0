import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing, useTheme } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  /** Ionicons name. Outline variants read better at this size. */
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  /** One sentence on why it is empty and what to do about it. */
  description?: string;
  /** The action that resolves the emptiness. Omit if there is not one. */
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shown when a query succeeds and returns nothing.
 *
 * Distinct from `ErrorState`, and the distinction matters: empty means the
 * system worked and there is genuinely nothing there, so the copy should tell
 * the user how to change that. "No bookings yet" plus a "Find a practitioner"
 * button, not "No results".
 *
 * The whole block is one accessibility node so a screen reader reads the
 * situation as one sentence instead of three fragments.
 */
export function EmptyState({
  icon = 'sparkles-outline',
  title,
  description,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View
      style={[styles.container, style]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={description ? `${title}. ${description}` : title}
    >
      <View style={[styles.iconWell, { backgroundColor: theme.colors.surfaceMuted }]}>
        <Ionicons name={icon} size={28} color={theme.colors.textMuted} />
      </View>

      <Text variant="h4" align="center" style={styles.title}>
        {title}
      </Text>

      {description ? (
        <Text variant="bodySmall" color="muted" align="center" style={styles.description}>
          {description}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.huge,
    paddingHorizontal: spacing.xl,
  },
  iconWell: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.xs,
  },
  description: {
    maxWidth: 320,
  },
  action: {
    marginTop: spacing.lg,
    // `Button` sets `alignSelf: 'flex-start'` on its own root, which overrides
    // this container's `alignItems: 'center'` — so the icon, title and
    // description centred and the button alone sat left. Stating it here wins,
    // because this style is applied last.
    alignSelf: 'center',
  },
});
