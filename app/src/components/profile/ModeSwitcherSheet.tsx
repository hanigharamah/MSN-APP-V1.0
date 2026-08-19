import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/events';
import { Avatar, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useMode, type AppMode } from '@/context/ModeContext';
import { iconSizes, MIN_TOUCH_TARGET, radii, spacing, useTheme } from '@/theme';

export interface ModeSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
}

interface ModeRow {
  value: AppMode;
  label: string;
  detail: string;
}

const ROWS: readonly ModeRow[] = [
  {
    value: 'seeking',
    label: 'Seeking',
    detail: 'Sessions you book and tickets you hold',
  },
  {
    value: 'hosting',
    label: 'Hosting',
    detail: 'Sessions people book with you',
  },
];

/**
 * The mode switcher, raised by holding the Profile tab.
 *
 * One account, two ways of looking at it — the same idea as Airbnb's "Switch to
 * hosting", reachable from the tab bar rather than buried a screen deep. Both
 * rows carry the same avatar on purpose: these are not two accounts, and the
 * repeated face is what says so. The name never changes, the reviews never
 * change, only which half of the product opens first.
 *
 * Rows announce as radios in a `radiogroup`, so a screen reader says that
 * choosing one deselects the other. Choosing closes the sheet — there is no
 * second confirming tap, because the whole point of the gesture is speed.
 *
 * Only ever mounted for an account that can host; a seeker has nothing to
 * choose between, and the caller does not raise this for them.
 */
export function ModeSwitcherSheet({ visible, onClose }: ModeSwitcherSheetProps) {
  const theme = useTheme();
  const { profile } = useAuth();
  const { mode, setMode } = useMode();

  if (profile === null) return null;

  const choose = (next: AppMode) => {
    setMode(next);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Switch mode">
      <View style={styles.rows} accessibilityRole="radiogroup">
        {ROWS.map((row) => {
          const selected = mode === row.value;
          return (
            <Pressable
              key={row.value}
              onPress={() => choose(row.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={`${row.label}. ${row.detail}`}
              style={({ pressed }) => [
                styles.row,
                {
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                  backgroundColor: pressed
                    ? theme.colors.surfaceMuted
                    : selected
                      ? theme.colors.accentSubtle
                      : theme.colors.surface,
                },
              ]}
            >
              <Avatar
                uri={profile.avatar_url}
                name={profile.display_name}
                size="md"
                ringed={row.value === 'hosting'}
                ringColor={theme.colors.accent}
              />

              <View style={styles.text}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {row.label}
                </Text>
                <Text variant="caption" color="muted">
                  {row.detail}
                </Text>
              </View>

              {selected ? (
                <Ionicons
                  name="checkmark-circle"
                  size={iconSizes.lg}
                  color={theme.colors.accent}
                />
              ) : null}
            </Pressable>
          );
        })}
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
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
});
