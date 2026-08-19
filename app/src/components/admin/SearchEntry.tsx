import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { iconSizes, MIN_TOUCH_TARGET, radii, spacing, useTheme } from '@/theme';

export interface SearchEntryProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** What this is for, in the operator's terms. One short line. */
  hint: string;
  onPress: () => void;
}

/**
 * A quiet way into search, for when the operator already knows who they are
 * looking for.
 *
 * ## Why it is quiet, and why it exists at all
 *
 * The queue answers "what needs me?". It cannot answer "a practitioner emailed
 * me about their account, what is going on with it?" — and an operator who
 * cannot answer that in the app will answer it in the database instead, which
 * is worse for everyone.
 *
 * So search exists, and is deliberately styled as furniture: a low-contrast
 * row below the queue, no card, no colour, no count. Anything louder starts
 * competing with the work, and a directory that competes with the work is how
 * an admin tool turns back into a database browser one screen at a time.
 */
export function SearchEntry({ icon, label, hint, onPress }: SearchEntryProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent' },
      ]}
    >
      <Ionicons
        name={icon}
        size={iconSizes.md}
        color={theme.colors.textMuted}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <View style={styles.text}>
        <Text variant="bodySmall" color="secondary">
          {label}
        </Text>
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={iconSizes.xs}
        color={theme.colors.textMuted}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.lg,
  },
  text: {
    flex: 1,
  },
});
