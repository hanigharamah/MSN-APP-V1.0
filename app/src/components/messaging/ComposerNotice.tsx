import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { borderWidths, iconSizes, spacing, useTheme } from '@/theme';

export interface ComposerNoticeProps {
  title: string;
  description: string;
}

/**
 * Takes the composer's place when the viewer cannot send.
 *
 * The case this exists for is blocking. The RLS policy on `messages` refuses
 * the INSERT when either party has blocked the other, and it arrives as a bare
 * policy violation — so the choice is between a composer that silently fails
 * and an honest explanation of why the field is not there. It is also
 * deliberately vague about WHO blocked whom: telling someone they have been
 * blocked hands them information the other person did not choose to share.
 */
export function ComposerNotice({ title, description }: ComposerNoticeProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${title}. ${description}`}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderTopColor: theme.colors.border,
          borderTopWidth: borderWidths.hairline,
          paddingBottom: insets.bottom + spacing.md,
        },
      ]}
    >
      <Ionicons
        name="lock-closed-outline"
        size={iconSizes.md}
        color={theme.colors.textMuted}
        style={styles.icon}
      />
      <View style={styles.copy}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="bodySmall" color="secondary">
          {description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  icon: {
    marginTop: spacing.xxs,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
  },
});
