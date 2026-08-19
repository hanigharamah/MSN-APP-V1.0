import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components/ui';
import type { EventWithHost } from '@/lib/queries/events';
import { iconSizes, MIN_TOUCH_TARGET, radii, spacing, useTheme } from '@/theme';

export interface EventHostRowProps {
  host: EventWithHost['host'];
  /** Opens the host's profile. Omit and the row renders as static text. */
  onPress?: () => void;
}

/**
 * "Your host" — avatar, name, handle, verification, and a chevron into the
 * provider profile.
 *
 * The whole row is ONE accessible node with a composed label, per CONVENTIONS
 * §6: a screen-reader user should hear "Hosted by Maya Rivers, verified,
 * button", not five separate stops for avatar, name, handle, tick and chevron.
 */
export function EventHostRow({ host, onPress }: EventHostRowProps) {
  const theme = useTheme();

  if (!host) {
    return (
      <Text variant="bodySmall" color="muted">
        This host&rsquo;s profile is not available.
      </Text>
    );
  }

  const name = host.display_name;
  const label = [
    `Hosted by ${name}`,
    host.is_verified ? 'verified' : null,
    host.handle ? `@${host.handle}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');

  const body = (
    <>
      <Avatar uri={host.avatar_url} name={name} size="lg" />
      <View style={styles.text}>
        <View style={styles.nameRow}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          {host.is_verified ? (
            <Ionicons name="checkmark-circle" size={iconSizes.xs} color={theme.colors.accent} />
          ) : null}
        </View>
        {host.handle ? (
          <Text variant="caption" color="muted" numberOfLines={1}>
            @{host.handle}
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
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the host's profile"
      style={({ pressed }) => [
        styles.row,
        styles.pressable,
        pressed ? { backgroundColor: theme.colors.surfaceSunken } : null,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  pressable: {
    borderRadius: radii.lg,
  },
  text: {
    flex: 1,
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
