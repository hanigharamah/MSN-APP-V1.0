import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/events';
import { Text } from '@/components/ui';
import { iconSizes, MIN_TOUCH_TARGET, radii, spacing, useTheme } from '@/theme';

/** The two shapes a listing can take. Mirrors `services` and `events`. */
export type ListingKind = 'session' | 'event';

export interface NewListingSheetProps {
  visible: boolean;
  onClose: () => void;
  onChoose: (kind: ListingKind) => void;
}

interface KindOption {
  value: ListingKind;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
}

/**
 * The one question that has to be answered before anything else.
 *
 * A session and an event are booked in opposite directions — a session is a
 * duration people fit into YOUR hours, an event is a fixed date people buy a
 * place at — and almost every field downstream follows from which one this is.
 * Asking up front is cheaper than a single form that greys half of itself out.
 *
 * The wording describes the CONSEQUENCE rather than the category. "Sessions"
 * and "Events" alone are close enough to be guessed at wrongly by someone who
 * runs both; "you set the hours, they pick a time" cannot be.
 */
const OPTIONS: readonly KindOption[] = [
  {
    value: 'session',
    icon: 'time-outline',
    label: 'Sessions people book with you',
    detail: 'You set the hours, they pick a time',
  },
  {
    value: 'event',
    icon: 'calendar-outline',
    label: 'An event on a set date',
    detail: 'You set the date, they buy a ticket',
  },
];

export function NewListingSheet({ visible, onClose, onChoose }: NewListingSheetProps) {
  const theme = useTheme();

  return (
    <BottomSheet visible={visible} onClose={onClose} title="What are you offering?">
      <View style={styles.rows}>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => onChoose(option.value)}
            accessibilityRole="button"
            accessibilityLabel={`${option.label}. ${option.detail}`}
            style={({ pressed }) => [
              styles.row,
              {
                borderColor: theme.colors.border,
                backgroundColor: pressed ? theme.colors.surfaceMuted : theme.colors.surface,
              },
            ]}
          >
            <Ionicons name={option.icon} size={iconSizes.xl} color={theme.colors.accent} />
            <View style={styles.text}>
              <Text variant="bodyStrong">{option.label}</Text>
              <Text variant="caption" color="muted">
                {option.detail}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={iconSizes.md}
              color={theme.colors.textMuted}
            />
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: spacing.sm,
  },
  row: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
});
