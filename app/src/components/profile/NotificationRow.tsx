import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { borderWidths, spacing, useTheme } from '@/theme';
import type { Notification } from '@/types/database';

export interface NotificationRowProps {
  notification: Notification;
  onPress: (notification: Notification) => void;
  last?: boolean;
  /**
   * How many identical notifications collapsed into this row. 1 (the default)
   * renders exactly as before. See `groupNotifications`.
   */
  count?: number;
  /**
   * Unread for the GROUP — true if any collapsed row is unread. Defaults to
   * this notification's own state.
   */
  unread?: boolean;
}

/**
 * One notification.
 *
 * Unread is carried by a dot AND by the title's weight, because a colour dot
 * alone is invisible to a screen reader and marginal for anyone with a
 * colour-vision difference. The accessible label states it in words.
 *
 * Times are `formatRelative` — the viewer's zone, because a notification is
 * about something that happened in their life, not at a venue.
 */
export function NotificationRow({
  notification,
  onPress,
  last = false,
  count = 1,
  unread: unreadProp,
}: NotificationRowProps) {
  const theme = useTheme();
  const unread = unreadProp ?? notification.read_at === null;
  // "2 confirmations" rather than a bare "2": the number alone next to a
  // headline reads as a quantity of tickets, which is the one thing it is not.
  const countLabel = count > 1 ? `${count} updates about this` : null;

  return (
    <Pressable
      onPress={() => onPress(notification)}
      accessibilityRole="button"
      accessibilityLabel={[
        unread ? 'Unread' : null,
        notification.title,
        countLabel,
        notification.body,
        formatRelative(notification.created_at),
      ]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint="Marks this as read and opens it"
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomWidth: last ? 0 : borderWidths.hairline,
          borderBottomColor: theme.colors.border,
          backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
        },
      ]}
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: unread ? theme.colors.accent : 'transparent' },
        ]}
      />

      <View style={styles.copy}>
        <Text variant={unread ? 'bodyStrong' : 'body'} numberOfLines={2}>
          {notification.title}
        </Text>
        {notification.body ? (
          <Text variant="bodySmall" color="secondary" numberOfLines={2}>
            {notification.body}
          </Text>
        ) : null}
        <Text variant="caption" color="muted">
          {countLabel
            ? `${formatRelative(notification.created_at)} · ${countLabel}`
            : formatRelative(notification.created_at)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 60,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: spacing.xs,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
  },
});
