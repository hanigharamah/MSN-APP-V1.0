import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { ConversationRow } from '@/components/messaging';
import { EmptyState, ErrorState, Screen, SkeletonList } from '@/components/ui';
import { SignedOut } from '@/components/auth/SignedOut';
import { useAuth } from '@/context/AuthContext';
import { nextPage } from '@/lib/queries/client';
import { qk } from '@/lib/queries/keys';
import { listConversations, type ConversationWithParticipants } from '@/lib/queries/messages';
import { SCREEN_GUTTER, spacing, useTheme } from '@/theme';

/**
 * Messages — the conversation list.
 *
 * A `FlatList` rather than `<Screen scroll>`: conversations paginate, and a
 * ScrollView renders every row it is given. `Screen` is still the container so
 * the gutter lines up with the other tabs, with `edgeToEdge` so row separators
 * run the full width the way a native list does.
 *
 * Freshness has three sources and no polling:
 *   - `useUnreadCounts` (mounted in the tab layout) holds one Realtime
 *     subscription for the whole session and invalidates `qk.conversations.all`
 *     when anything arrives;
 *   - the focus effect below covers the gap where a tab screen stays mounted
 *     and `refetchOnMount` therefore never fires again;
 *   - pull to refresh, for when someone simply wants to be sure.
 */
export default function MessagesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const { data, isPending, isError, error, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: qk.conversations.list(userId),
      queryFn: ({ pageParam }) => listConversations(userId, pageParam),
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) => nextPage(lastPage, allPages),
      enabled: userId !== '',
    });

  /**
   * The focus effect exists for the SECOND visit onwards: a tab screen stays
   * mounted, so `refetchOnMount` never fires again and a thread read on another
   * screen would leave a stale unread dot here. The first focus arrives while
   * the initial fetch is still in flight, and invalidating then is a second
   * round trip for data already on its way — hence the ref.
   */
  const hasFocused = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (userId === '') return;
      if (!hasFocused.current) {
        hasFocused.current = true;
        return;
      }
      void queryClient.invalidateQueries({ queryKey: qk.conversations.list(userId) });
      void queryClient.invalidateQueries({ queryKey: qk.conversations.unreadCount(userId) });
    }, [queryClient, userId]),
  );

  const openConversation = useCallback(
    (conversationId: string) => {
      router.push({ pathname: '/conversation/[id]', params: { id: conversationId } });
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item }: { item: ConversationWithParticipants }) => (
      <ConversationRow conversation={item} viewerId={userId} onPress={openConversation} />
    ),
    [openConversation, userId],
  );

  // No in-body title. The tab's nav bar already says "Messages", and printing
  // it twice cost a whole heading's worth of vertical space to say nothing.
  // The signed-out branch below is different: it hides the nav bar and carries
  // its own large title, which is the Airbnb pattern the other tabs follow.
  const header = null;

  /**
   * Pages are offset ranges over `last_message_at desc`. A message arriving
   * between two page fetches shifts every row down by one, so the row that was
   * last on page 0 comes back again as the first row of page 1 — duplicate
   * `id`s, a duplicate-key warning, and the same conversation rendered twice.
   * `useUnreadCounts` invalidating `qk.conversations.all` on every inbound
   * message makes that likely rather than theoretical. Collapsing by id here is
   * cheaper and more robust than trying to keep offsets stable.
   */
  const conversations = useMemo(() => {
    const seen = new Set<string>();
    return (data?.pages.flat() ?? []).filter((conversation) => {
      if (seen.has(conversation.id)) return false;
      seen.add(conversation.id);
      return true;
    });
  }, [data]);

  // `enabled: false` leaves an infinite query `pending` forever, so without this
  // a missing session would render the skeleton permanently rather than
  // anything a person could act on.
  if (userId === '') {
    return (
      <SignedOut
        screenTitle="Messages"
        headline="Log in to see your messages"
        description="Once you log in, conversations with practitioners appear here — questions before you book, and everything after."
      />
    );
  }

  if (isPending) {
    return (
      <Screen>
        {header}
        {/* Skeletons are hidden from assistive tech, so the container is what
            announces that something is happening. */}
        <View accessibilityLiveRegion="polite" accessibilityLabel="Loading your conversations">
          <SkeletonList count={6} itemHeight={72} />
        </View>
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        {header}
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen edgeToEdge>
      <FlatList
        data={conversations}
        keyExtractor={(conversation) => conversation.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.content, conversations.length === 0 ? styles.grow : null]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isFetchingNextPage}
            onRefresh={() => void refetch()}
            tintColor={theme.colors.accent}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footer}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title="No conversations yet"
            // Conversations cannot be started from this screen — there is no
            // "new message" button anywhere in the product, by design. They
            // begin from a practitioner's profile or from a booking, so the
            // empty state says exactly that rather than leaving someone
            // hunting for a compose button that does not exist.
            description="Conversations start from a practitioner's profile, or from a session you have booked. Open a profile and tap Message to ask about a session before you book."
            actionLabel="Find a practitioner"
            onAction={() => router.push('/(tabs)')}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingBottom: spacing.lg,
  },
  grow: {
    flexGrow: 1,
  },
  footer: {
    paddingVertical: spacing.md,
  },
});
