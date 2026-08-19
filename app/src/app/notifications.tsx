import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { NotificationRow, groupNotifications, notificationSubject } from '@/components/profile';
import type { NotificationGroup } from '@/components/profile';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Screen,
  Skeleton,
} from '@/components/ui';
import { useRequiredUserId } from '@/context/AuthContext';
import { qk } from '@/lib/queries/keys';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/queries/notifications';
import { spacing } from '@/theme';

/**
 * Notifications.
 *
 * ## Why this is its own screen
 *
 * It used to be a section halfway down the Profile tab, which put two unrelated
 * jobs on one page: "who am I and what are my settings" is identity, and rarely
 * changes; "what has happened since I last looked" is time-sensitive and is the
 * reason someone opens the app at all. Filing the second inside the first meant
 * the only route to today's news was: Profile tab, scroll, read. Nothing told
 * you there was anything to read.
 *
 * Now the bell in the header carries the unread count from every tab, and this
 * screen is the whole list rather than a truncated preview with "3 older, not
 * shown" underneath it.
 *
 * ## Grouping
 *
 * Rows are collapsed by what they are about — see `groupNotifications`. Two
 * orders for one event are one piece of news to the person who placed them.
 *
 * Tapping marks the WHOLE group read, not just the row shown. Marking only the
 * visible one would leave the group unread and unchanged after a tap, which
 * reads as a broken button.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const profileId = useRequiredUserId();

  const notifications = useQuery({
    queryKey: qk.notifications.list(profileId),
    queryFn: () => listNotifications(profileId),
  });

  const groups = useMemo(
    () => groupNotifications(notifications.data ?? []),
    [notifications.data],
  );

  const unreadGroups = groups.filter((group) => group.unread).length;

  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: qk.notifications.all });
  };

  const markRead = useMutation({
    mutationFn: (ids: readonly string[]) =>
      Promise.all(ids.map((id) => markNotificationRead(id))),
    onSuccess: settle,
  });

  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsRead(profileId),
    onSuccess: settle,
  });

  const open = useCallback(
    (group: NotificationGroup) => {
      if (group.unread) markRead.mutate(group.ids);

      // Marked read either way: the person has seen it, and a row that stays
      // bold after a tap reads as broken. An unresolvable subject simply goes
      // nowhere rather than pushing a not-found screen.
      const target = notificationSubject(group.notification);
      if (!target) return;

      // Typed pushes, one per kind. A template string would satisfy the router
      // at runtime and lose every compile-time guarantee that the route exists.
      switch (target.kind) {
        case 'event':
          router.push({ pathname: '/event/[id]', params: { id: target.id } });
          return;
        case 'service':
          router.push({ pathname: '/service/[id]', params: { id: target.id } });
          return;
        case 'provider':
          router.push({ pathname: '/provider/[id]', params: { id: target.id } });
          return;
        case 'booking':
          router.push({ pathname: '/booking/[id]', params: { id: target.id } });
          return;
        case 'conversation':
          router.push({ pathname: '/conversation/[id]', params: { id: target.id } });
          return;
      }
    },
    [markRead, router],
  );

  if (notifications.isPending) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Notifications' }} />
        <View
          style={styles.page}
          accessibilityLiveRegion="polite"
          accessibilityLabel="Loading your notifications"
        >
          <Skeleton height={64} radius="lg" />
          <Skeleton height={64} radius="lg" />
          <Skeleton height={64} radius="lg" />
        </View>
      </Screen>
    );
  }

  if (notifications.isError) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Notifications' }} />
        <ErrorState
          error={notifications.error}
          onRetry={() => void notifications.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen edgeToEdge safeBottom>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerRight: () =>
            unreadGroups > 0 ? (
              <Button
                label="Mark all read"
                variant="ghost"
                size="sm"
                onPress={() => markAllRead.mutate()}
                loading={markAllRead.isPending}
                accessibilityLabel="Mark all notifications read"
              />
            ) : null,
        }}
      />

      <FlatList
        data={groups}
        keyExtractor={(group) => group.notification.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={notifications.isFetching && !notifications.isPending}
            onRefresh={() => void notifications.refetch()}
          />
        }
        ListHeaderComponent={
          markAllRead.isError || markRead.isError ? (
            <ErrorState
              error={markAllRead.error ?? markRead.error}
              style={styles.inlineError}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Card variant="outlined" padding="sm" style={styles.card}>
            <NotificationRow
              notification={item.notification}
              count={item.count}
              unread={item.unread}
              onPress={() => open(item)}
              last
            />
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="notifications-outline"
            title="Nothing yet"
            description="Booking confirmations, replies and event updates land here."
            actionLabel="Find something to book"
            onAction={() => router.replace('/(tabs)')}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.md, gap: spacing.sm },
  content: { padding: spacing.md, gap: spacing.xs },
  card: { padding: spacing.sm },
  inlineError: { marginBottom: spacing.sm },
});
