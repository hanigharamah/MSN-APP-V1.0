import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components/ui';
import { iconSizes, MIN_TOUCH_TARGET, radii, spacing, useTheme } from '@/theme';

export interface BookingPartyRowProps {
  /** "Practitioner", "Seeker", "You". */
  role: string;
  name: string;
  avatarUrl?: string | null;
  handle?: string | null;
  isVerified?: boolean;
  /** Omit for the viewer's own row — there is nowhere useful to go. */
  onPress?: () => void;
}

/**
 * One party on the booking detail screen.
 *
 * Both sides are shown to both people. A booking is an agreement between two
 * named parties and the screen is the record of it; a provider looking at a
 * cancellation needs to see who it was with as much as the seeker does.
 *
 * Composed into one accessible node — avatar, role, name and the verified tick
 * are four visual pieces of a single fact.
 */
export function BookingPartyRow({
  role,
  name,
  avatarUrl,
  handle,
  isVerified = false,
  onPress,
}: BookingPartyRowProps) {
  const theme = useTheme();

  const label = `${role}: ${name}${isVerified ? ', verified' : ''}`;

  const content = (
    <>
      <Avatar uri={avatarUrl} name={name} size="md" />

      <View style={styles.text}>
        <Text variant="caption" color="muted">
          {role}
        </Text>
        <View style={styles.nameRow}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          {isVerified ? (
            <Ionicons
              name="checkmark-circle"
              size={iconSizes.xs}
              color={theme.colors.accentText}
            />
          ) : null}
        </View>
        {handle ? (
          <Text variant="caption" color="muted" numberOfLines={1}>
            @{handle}
          </Text>
        ) : null}
      </View>

      {onPress ? (
        <Ionicons name="chevron-forward" size={iconSizes.md} color={theme.colors.textMuted} />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={label}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens their profile"
      style={({ pressed }) => [
        styles.row,
        {
          borderRadius: radii.lg,
          backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
        },
      ]}
    >
      {content}
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
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  name: {
    flexShrink: 1,
  },
});
