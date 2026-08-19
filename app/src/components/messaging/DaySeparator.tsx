import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { borderWidths, radii, spacing, useTheme } from '@/theme';
import { dayHeading } from './message-groups';

export interface DaySeparatorProps {
  /** Any message from the day being introduced. */
  iso: string;
}

/**
 * The `Today` / `Yesterday` / date pill between days of a thread.
 *
 * One accessible node with the whole phrase, so a screen reader moving through
 * the thread hears "Yesterday" as a landmark instead of stopping on a
 * decorative rule.
 */
export function DaySeparator({ iso }: DaySeparatorProps) {
  const theme = useTheme();

  return (
    <View style={styles.container} accessible accessibilityRole="header">
      <View
        style={[
          styles.pill,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
            borderWidth: borderWidths.hairline,
          },
        ]}
      >
        <Text variant="caption" color="secondary">
          {dayHeading(iso)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
  },
});
