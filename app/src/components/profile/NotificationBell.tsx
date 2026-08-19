import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { qk } from '@/lib/queries/keys';
import { countUnreadNotifications } from '@/lib/queries/notifications';
import { iconSizes, spacing, useTheme } from '@/theme';

/**
 * The bell in the header. Present on every tab, always.
 *
 * Notifications used to live inside the Profile tab, which meant the only way
 * to discover you had any was to go looking — the app never said. A count you
 * can see from wherever you happen to be is the entire point: it is the one
 * control whose job is to tell you something is waiting.
 *
 * ## The count
 *
 * Unread ROWS, not unread groups. The badge and the list deliberately disagree:
 * the list collapses two orders for one event into one line, but the badge is a
 * promise about how much is new, and under-counting it would leave someone
 * thinking they had seen everything. Over 9 shows "9+" so the badge stays a
 * circle at any count.
 *
 * `useUnreadCounts` in the tabs layout already keeps `qk.notifications` fresh
 * over Realtime, so this query re-renders on its own when a row arrives — there
 * is no polling here and there must not be.
 */
export function NotificationBell() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  // '' rather than undefined so the key is always a valid string. The query is
  // disabled without a session, so that placeholder key is never populated —
  // and because the viewer is now part of the key, a real one can never be
  // read by the next person to sign in.
  const profileId = session?.user.id ?? '';

  const unread = useQuery({
    queryKey: qk.notifications.unreadCount(profileId),
    queryFn: () => countUnreadNotifications(profileId),
    enabled: profileId !== '',
  });

  const count = unread.data ?? 0;
  const label = count > 9 ? '9+' : String(count);

  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={
        count === 0
          ? 'Notifications'
          : `Notifications, ${count} unread`
      }
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.5 : 1 }]}
    >
      <Ionicons
        name={count > 0 ? 'notifications' : 'notifications-outline'}
        size={iconSizes.md}
        color={theme.colors.textHeading}
      />
      {count > 0 ? (
        <View style={[styles.badge, { backgroundColor: theme.colors.accent }]}>
          <Text variant="caption" style={[styles.badgeText, { color: theme.colors.textOnAccent }]}>
            {label}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  badge: {
    position: 'absolute',
    top: -2,
    right: spacing.xxs,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 11, lineHeight: 14 },
});
