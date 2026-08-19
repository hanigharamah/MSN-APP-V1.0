import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { Avatar, Button, Card, EmptyState, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { useRequiredUserId } from '@/context/AuthContext';
import { qk } from '@/lib/queries/keys';
import { listBlocked, unblockProfile } from '@/lib/queries/safety';
import { spacing } from '@/theme';

/**
 * Everyone you have blocked.
 *
 * ## Why it needs its own screen
 *
 * Blocking is easy to do in a bad moment and impossible to find afterwards.
 * Without a list, the only way to unblock someone is to navigate back to their
 * profile — which requires remembering who they were and finding them again,
 * while they are hidden from you. A block you cannot undo is a block you cannot
 * really consent to.
 *
 * It also completes what guideline 1.2 asks for: a blocking mechanism a person
 * is actually in control of, not just a one-way switch.
 *
 * ## Reading your own blocks only
 *
 * RLS on `blocked_users` is `blocker_id = auth.uid()`, so this can only ever
 * return rows this viewer created. There is deliberately no screen anywhere
 * showing who has blocked YOU — that would hand out information the blocker
 * chose not to share, and would make blocking unsafe for the person doing it.
 */
export default function BlockedScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const viewerId = useRequiredUserId();

  const blocked = useQuery({
    queryKey: qk.profiles.blocked,
    queryFn: () => listBlocked(viewerId),
  });

  const unblock = useMutation({
    mutationFn: (blockedId: string) => unblockProfile(viewerId, blockedId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.profiles.blocked });
      // Conversations with that person become reachable again.
      void queryClient.invalidateQueries({ queryKey: qk.conversations.all });
    },
  });

  if (blocked.isPending) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Blocked accounts' }} />
        <View style={styles.page} accessibilityLabel="Loading your blocked list">
          <Skeleton height={64} radius="lg" />
          <Skeleton height={64} radius="lg" />
        </View>
      </Screen>
    );
  }

  if (blocked.isError) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Blocked accounts' }} />
        <ErrorState error={blocked.error} onRetry={() => void blocked.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen edgeToEdge safeBottom>
      <Stack.Screen options={{ title: 'Blocked accounts', headerBackTitle: 'Back' }} />

      <FlatList
        data={blocked.data}
        keyExtractor={(row) => row.blocked_id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card variant="outlined" padding="sm" style={styles.row}>
            <Avatar
              uri={item.profile?.avatar_url ?? null}
              name={item.profile?.display_name ?? 'Blocked account'}
              size="sm"
            />
            <View style={styles.name}>
              <Text variant="body" numberOfLines={1}>
                {item.profile?.display_name ?? 'Blocked account'}
              </Text>
              {item.profile?.handle ? (
                <Text variant="bodySmall" color="muted">{`@${item.profile.handle}`}</Text>
              ) : null}
            </View>
            <Button
              label="Unblock"
              variant="secondary"
              size="sm"
              loading={unblock.isPending && unblock.variables === item.blocked_id}
              onPress={() => unblock.mutate(item.blocked_id)}
              accessibilityLabel={`Unblock ${item.profile?.display_name ?? 'this account'}`}
            />
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="ban-outline"
            title="Nobody blocked"
            description="Blocking someone stops them messaging you. You can do it from the ⋯ menu on their profile."
            actionLabel="Back to browsing"
            onAction={() => router.replace('/(tabs)')}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.md, gap: spacing.sm },
  list: { padding: spacing.md, gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, gap: spacing.xxs },
});
