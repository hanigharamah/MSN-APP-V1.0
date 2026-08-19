import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  InteractionManager,
  Keyboard,
  KeyboardAvoidingView,
  StyleSheet,
  View,
} from 'react-native';

import {
  Composer,
  ComposerNotice,
  DaySeparator,
  MessageBubble,
  conversationTitle,
  otherParticipants,
  rowContext,
} from '@/components/messaging';
import { EmptyState, ErrorState, Screen, SkeletonList } from '@/components/ui';
import { FormError } from '@/components/auth/FormError';
import { ReportSheet, SafetyMenu } from '@/components/safety';
import { useAuth } from '@/context/AuthContext';
import { isAppError, toAppError } from '@/lib/errors';
import { nextPage } from '@/lib/queries/client';
import { qk } from '@/lib/queries/keys';
import { blockProfile, hasBlocked, unblockProfile } from '@/lib/queries/safety';
import {
  getConversation,
  isBlockedBetween,
  listMessages,
  markConversationRead,
  sendMessage,
  subscribeToMessages,
  type MessageWithSender,
} from '@/lib/queries/messages';
import { SCREEN_GUTTER, spacing, useTheme } from '@/theme';
import type { Message } from '@/types/database';

type MessagePages = InfiniteData<MessageWithSender[], number>;

/**
 * Serialises channel teardown across screen instances.
 *
 * `subscribeToMessages` calls `supabase.channel(topic)`, which returns a NEW
 * `RealtimeChannel` every time, and `RealtimeClient._remove()` drops channels
 * from its registry **by topic**:
 *
 *     this.channels = this.channels.filter((c) => c.topic !== channel.topic)
 *
 * So if a thread is closed and reopened fast enough that the leaving instance
 * of `messages:<id>` overlaps the joining one, both are bound and every insert
 * fires twice — and when the first finishes leaving it deregisters the second
 * as collateral, leaving a channel that is live but no longer tracked. Nothing
 * inside one component can see the other's channel, so the queue is module
 * scope: a new subscribe waits for the previous unsubscribe to complete.
 */
let channelTeardown: Promise<unknown> = Promise.resolve();

/**
 * Anchors the scroll position while older pages land above the viewport.
 * Hoisted so the object identity is stable — a fresh literal every render makes
 * the list reconfigure its anchor on each pass.
 */
const MAINTAIN_POSITION = { minIndexForVisible: 0 } as const;

/**
 * A message thread.
 *
 * Three things here are load-bearing and easy to get subtly wrong.
 *
 * **The list is inverted.** `listMessages` returns newest-first, which is the
 * order an inverted `FlatList` wants. Inverting is what makes the thread open
 * at the newest message and stay pinned there as new ones arrive, and it makes
 * "load older" the natural end-reached direction instead of a scroll-anchoring
 * problem.
 *
 * **The Realtime channel is unsubscribed on unmount.** Every thread the user
 * opens would otherwise leave a live subscription behind — a socket leak, and
 * a duplicate-message bug the next time they open the same thread. The payload
 * is a bare `messages` row with no `sender` embed (Realtime does not run the
 * select), so the sender is joined from the participants already loaded rather
 * than refetched.
 *
 * **Blocked users cannot message.** The RLS insert policy refuses silently, so
 * `isBlockedBetween` is checked before the composer renders — and the send
 * mutation still handles a `forbidden` result, because a block can land between
 * the check and the tap.
 */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? '';
  const enabled = Boolean(id) && viewerId !== '';

  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<unknown>(null);
  /**
   * Latched when the database refuses a send.
   *
   * `isBlockedBetween` cannot see a block pointed AT the viewer — the RLS
   * policy on `blocked_users` is `using (blocker_id = auth.uid())`, so the
   * query returns zero rows for exactly the case that stops a message going
   * out (see the report accompanying this pass). Until that policy grows a
   * `blocked_id = auth.uid()` arm, the refusal itself is the only signal the
   * client gets, and re-rendering a composer that has just been told "no" only
   * invites the same failure again.
   */
  const [sendRefused, setSendRefused] = useState(false);
  const focused = useRef(false);

  /**
   * `KeyboardAvoidingView` compares its own frame — which `onLayout` reports
   * relative to its PARENT — against the keyboard's position on the window. In
   * a screen that starts at the top of the window those agree; in this one they
   * do not, because `(modal)` is presented modally and then adds a header. The
   * difference has to be handed back as `keyboardVerticalOffset` or the
   * composer sits under the keyboard by exactly that much.
   *
   * `useHeaderHeight()` would normally supply it, but expo-router 57 vendors
   * React Navigation and `@react-navigation/elements` is not a dependency here.
   * Measuring is better anyway: it stays correct for the modal inset, a large
   * title, or a device with a different header metric.
   */
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const frame = useRef<ComponentRef<typeof View>>(null);

  const measureFrame = useCallback(() => {
    frame.current?.measureInWindow((_x, y) => {
      setKeyboardOffset((current) => (Math.round(y) === current ? current : Math.round(y)));
    });
  }, []);

  /**
   * `onLayout` alone is not enough, and the failure is invisible until someone
   * taps the field.
   *
   * A `(modal)` screen is laid out while it is still sliding up, so the first
   * `measureInWindow` can report a y of most of the screen height — an offset
   * that would push the composer hundreds of points above the keyboard. Layout
   * does not change when the presentation animation finishes (only the
   * transform does), so `onLayout` never fires again to correct it.
   *
   * Re-measuring after interactions settles the presented position, and again
   * as the keyboard opens covers rotation, a hardware keyboard being detached,
   * and the header growing when a long thread title wraps.
   */
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(measureFrame);
    const listeners = [
      Keyboard.addListener('keyboardWillShow', measureFrame),
      Keyboard.addListener('keyboardDidShow', measureFrame),
    ];
    return () => {
      task.cancel();
      for (const listener of listeners) listener.remove();
    };
  }, [measureFrame]);

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  const conversation = useQuery({
    queryKey: qk.conversations.detail(viewerId, id),
    queryFn: () => getConversation(id),
    enabled,
  });

  const messages = useInfiniteQuery({
    queryKey: qk.conversations.messages(viewerId, id),
    queryFn: ({ pageParam }) => listMessages(id, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => nextPage(lastPage, allPages),
    enabled,
  });

  const others = useMemo(
    () => (conversation.data ? otherParticipants(conversation.data, viewerId) : []),
    [conversation.data, viewerId],
  );

  /**
   * `qk` has no entry for blocks, and hand-writing a key would break prefix
   * invalidation. Deriving it from the conversation prefix keeps
   * `invalidateQueries({ queryKey: qk.conversations.all })` working.
   *
   * TODO(agent · messaging): add `qk.conversations.blocked(id)` to `keys.ts`
   * and use it here — this is the only derived key in the app.
   */
  const blockedKey = useMemo(
    () => [...qk.conversations.detail(viewerId, id), 'blocked'] as const,
    [id, viewerId],
  );

  const blocked = useQuery({
    queryKey: blockedKey,
    queryFn: async () => {
      const results = await Promise.all(
        others.map((participant) => isBlockedBetween(viewerId, participant.id)),
      );
      return results.some(Boolean);
    },
    enabled: enabled && others.length > 0,
  });

  // ---------------------------------------------------------------------------
  // Cache patching
  // ---------------------------------------------------------------------------
  /**
   * Inserts a message at the head of the newest page, unless it is already
   * there. Both Realtime and the send mutation deliver the same row, so the
   * de-duplication is what stops a sent message appearing twice.
   */
  const patchMessage = useCallback(
    (incoming: Message) => {
      queryClient.setQueryData<MessagePages>(qk.conversations.messages(viewerId, id), (current) => {
        if (!current) return current;
        const exists = current.pages.some((page) =>
          page.some((message) => message.id === incoming.id),
        );
        if (exists) return current;

        const sender = others.find((participant) => participant.id === incoming.sender_id);
        const withSender: MessageWithSender = {
          ...incoming,
          sender: sender
            ? { id: sender.id, display_name: sender.display_name, avatar_url: sender.avatar_url }
            : null,
        };

        const [newest = [], ...rest] = current.pages;
        return { ...current, pages: [[withSender, ...newest], ...rest] };
      });

      // The list's ordering and unread dots are derived from `conversations`,
      // which Realtime has just changed underneath us.
      void queryClient.invalidateQueries({ queryKey: qk.conversations.list(viewerId) });
    },
    [id, others, queryClient, viewerId],
  );

  // ---------------------------------------------------------------------------
  // Read receipts
  // ---------------------------------------------------------------------------
  const markRead = useCallback(async () => {
    if (!enabled) return;
    try {
      await markConversationRead(id, viewerId);
      void queryClient.invalidateQueries({ queryKey: qk.conversations.unreadCount(viewerId) });
      void queryClient.invalidateQueries({ queryKey: qk.conversations.list(viewerId) });
    } catch (caught) {
      // Failing to mark read is not worth interrupting a conversation for —
      // the badge is briefly wrong and self-corrects on the next visit.
      console.warn('[messaging] could not mark the conversation read', caught);
    }
  }, [enabled, id, queryClient, viewerId]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void markRead();
      return () => {
        focused.current = false;
      };
    }, [markRead]),
  );

  // ---------------------------------------------------------------------------
  // Realtime
  // ---------------------------------------------------------------------------
  const handleIncoming = useCallback(
    (incoming: Message) => {
      patchMessage(incoming);
      // Anything arriving while the thread is on screen has been read by
      // definition; anything arriving while it is not stays unread.
      if (focused.current && incoming.sender_id !== viewerId) void markRead();
    },
    [markRead, patchMessage, viewerId],
  );

  /**
   * The handler is held in a ref, and that is the whole point.
   *
   * `patchMessage` depends on `others`, which is derived from `conversation.data`
   * — and `useUnreadCounts` invalidates `qk.conversations.all` on every inbound
   * notification, which prefix-matches `['conversations', 'detail', id]`. So the
   * conversation refetches, its object identity changes, and a handler in the
   * dependency array would tear the channel down and rebuild it several times a
   * minute. Every rebuild is a window where an insert is missed, and an overlap
   * where two instances of the same topic are both live.
   */
  const handlerRef = useRef(handleIncoming);
  useEffect(() => {
    handlerRef.current = handleIncoming;
  }, [handleIncoming]);

  // One channel per open thread, closed on unmount. Keyed on a boolean rather
  // than the conversation object so a refetch cannot move it: the only reasons
  // to rebuild are a different thread or a different signed-in state.
  const conversationLoaded = conversation.isSuccess && conversation.data !== null;

  useEffect(() => {
    if (!enabled || !conversationLoaded) return;

    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    const opened = channelTeardown.then(() => {
      if (cancelled) return;
      channel = subscribeToMessages(id, (incoming) => handlerRef.current(incoming));
    });

    return () => {
      cancelled = true;
      // Mirrors `RealtimeClient.removeChannel`: `unsubscribe()` leaves the
      // channel's timers running, and only `teardown()` stops them. Chaining
      // onto `channelTeardown` is what keeps the next thread from joining the
      // socket before this one has finished leaving it.
      channelTeardown = opened.then(async () => {
        if (!channel) return;
        const status = await channel.unsubscribe();
        if (status === 'ok') channel.teardown();
      });
    };
  }, [conversationLoaded, enabled, id]);

  // ---------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------
  const send = useMutation({
    mutationFn: (body: string) => sendMessage({ conversationId: id, senderId: viewerId, body }),
    onSuccess: (message) => {
      patchMessage(message);
      setSendError(null);
      // `last_message_at` has just moved past the viewer's `last_read_at`, and
      // `bump_conversation` does not know the reader is the author. Without
      // this, sending the last word in a thread leaves it showing an unread dot
      // in the list and counted in the tab badge — the user marked unread by
      // their own message. `isConversationUnread` covers the same ground from
      // `last_message_sender_id`; re-reading here also fixes the server row so
      // `countUnreadConversations`, which has no sender to compare, agrees.
      void markRead();
    },
    onError: (caught, body) => {
      const refused = isAppError(caught) && caught.kind === 'forbidden';

      if (refused) {
        // No point handing the text back to a field that is about to be
        // replaced by an explanation — the message cannot be sent here at all.
        setSendRefused(true);
      } else {
        // Anything else is worth retrying, so give the text back rather than
        // losing it.
        setDraft((current) => (current.length === 0 ? body : current));
      }

      setSendError(
        refused
          ? toAppError(
              new Error(
                'This message was not sent. One of you may no longer be able to message the other.',
              ),
              'send that message',
            )
          : caught,
      );
      void queryClient.invalidateQueries({ queryKey: blockedKey });
    },
  });

  const isBlocked = blocked.data === true || sendRefused;

  const handleSend = useCallback(() => {
    const body = draft.trim();
    if (body.length === 0 || send.isPending || isBlocked) return;
    setDraft('');
    send.mutate(body);
  }, [draft, isBlocked, send]);

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  const title = conversation.data ? conversationTitle(conversation.data, viewerId) : 'Conversation';

  /**
   * Pages are offset ranges over `created_at desc`, so they are only stable
   * while nothing is being written. A message arriving between the fetch of
   * page 0 and page 1 shifts every row down one and the boundary row comes back
   * twice; `qk.conversations.all` being invalidated on every inbound
   * notification refetches all loaded pages and does the same thing. Duplicate
   * `id`s are duplicate `keyExtractor` values, which is a duplicate bubble and a
   * React key warning.
   *
   * Re-sorting on top of that keeps a Realtime insert — which is spliced onto
   * the head of page 0 regardless of its timestamp — in the right place when it
   * arrives out of order.
   */
  const items = useMemo(() => {
    const seen = new Set<string>();
    const unique = (messages.data?.pages.flat() ?? []).filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    });
    return unique.sort((a, b) => {
      const delta = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return delta !== 0 ? delta : b.id.localeCompare(a.id);
    });
  }, [messages.data]);

  const renderItem = useCallback(
    ({ item, index }: { item: MessageWithSender; index: number }) => {
      const { startsDay, startsRun } = rowContext(items, index);
      return (
        <View>
          {startsDay ? <DaySeparator iso={item.created_at} /> : null}
          <MessageBubble
            message={item}
            isMine={item.sender_id === viewerId}
            showSender={startsRun && others.length > 1}
          />
        </View>
      );
    },
    [items, others.length, viewerId],
  );

  const router = useRouter();

  // A direct thread has exactly one other person, and that is the only shape
  // where "report this person" or "block them" is unambiguous. A group thread
  // gets no menu rather than a menu that acts on the wrong participant.
  const soleOther = others.length === 1 ? (others[0] ?? null) : null;
  const [reporting, setReporting] = useState(false);

  const blockedByMe = useQuery({
    queryKey: [...qk.conversations.detail(viewerId, id), 'blocked-by-me'] as const,
    queryFn: async () =>
      soleOther === null || viewerId === '' ? false : hasBlocked(viewerId, soleOther.id),
    enabled: soleOther !== null && viewerId !== '',
  });

  const blockMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (soleOther === null || viewerId === '') return false;
      if (next) await blockProfile(viewerId, soleOther.id);
      else await unblockProfile(viewerId, soleOther.id);
      return next;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.conversations.all });
      void queryClient.invalidateQueries({ queryKey: qk.profiles.blocked });
    },
  });

  /*
   * Report and block, from inside the conversation.
   *
   * These existed only on the provider profile, which is the wrong place for
   * the surface where user-generated content is most direct: from a harassing
   * message there was no route to either control without independently hunting
   * down that person's profile. App Store guideline 1.2 asks for a way to
   * report content and block abusive users — "somewhere else in the app" does
   * not satisfy it when the abuse is happening here.
   */
  const screenTitle = (
    <Stack.Screen
      options={{
        title,
        headerRight:
          soleOther === null
            ? undefined
            : () => (
                <SafetyMenu
                  personName={soleOther.display_name}
                  isBlocked={blockedByMe.data ?? false}
                  onReport={() => setReporting(true)}
                  onToggleBlock={() => blockMutation.mutate(!(blockedByMe.data ?? false))}
                />
              ),
      }}
    />
  );

  // Both queries are `enabled: false` without an id or a session, and a
  // disabled query stays `pending` for ever — so the skeleton branch below
  // would never resolve. Say what is actually wrong instead.
  if (!enabled) {
    return (
      <Screen>
        {screenTitle}
        <EmptyState
          icon="chatbubble-outline"
          title="Conversation unavailable"
          description="This conversation could not be opened."
          actionLabel="Back to Messages"
          onAction={() => router.replace('/(tabs)/messages')}
        />
      </Screen>
    );
  }

  if (conversation.isPending || messages.isPending) {
    return (
      <Screen>
        {screenTitle}
        <View accessibilityLiveRegion="polite" accessibilityLabel="Loading this conversation">
          <SkeletonList count={8} itemHeight={56} />
        </View>
      </Screen>
    );
  }

  if (conversation.isError || messages.isError) {
    const error = conversation.error ?? messages.error;
    return (
      <Screen>
        {screenTitle}
        <ErrorState
          error={error}
          onRetry={() => {
            void conversation.refetch();
            void messages.refetch();
          }}
        />
      </Screen>
    );
  }

  if (!conversation.data) {
    return (
      <Screen>
        {screenTitle}
        <EmptyState
          icon="chatbubble-outline"
          title="Conversation not found"
          description="It may have been removed, or you may no longer be part of it."
          actionLabel="Back to Messages"
          onAction={() => router.replace('/(tabs)/messages')}
        />
      </Screen>
    );
  }

  return (
    <Screen edgeToEdge>
      {screenTitle}

      {soleOther === null ? null : (
        <ReportSheet
          visible={reporting}
          onClose={() => setReporting(false)}
          subject={{ kind: 'profile', id: soleOther.id }}
          subjectLabel={soleOther.display_name}
        />
      )}

      <View ref={frame} style={styles.flex} onLayout={measureFrame}>
        <KeyboardAvoidingView
          style={styles.flex}
          // `padding` is the behaviour that keeps an inverted list's newest
          // message visible while the composer rides up. Expo SDK 54+ is
          // edge-to-edge on Android, where `adjustResize` no longer shrinks the
          // window on its own, so both platforms need it.
          behavior="padding"
          keyboardVerticalOffset={keyboardOffset}
        >
          <FlatList
            data={items}
            inverted
            keyExtractor={(message) => message.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            // Older pages are appended to an inverted list, which means they
            // are inserted ABOVE what is on screen. Without this the content
            // height jumps by a page and the reader is thrown backwards through
            // the thread mid-scroll.
            maintainVisibleContentPosition={MAINTAIN_POSITION}
            onEndReachedThreshold={0.5}
            onEndReached={() => {
              if (messages.hasNextPage && !messages.isFetchingNextPage) {
                void messages.fetchNextPage();
              }
            }}
            ListFooterComponent={
              messages.isFetchingNextPage ? (
                <View style={styles.older}>
                  <ActivityIndicator color={theme.colors.accent} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <EmptyState
                  icon="chatbubble-outline"
                  title="No messages yet"
                  description={
                    isBlocked
                      ? 'This conversation can no longer be used.'
                      : 'Say hello. Practitioners usually reply within a day.'
                  }
                />
              </View>
            }
          />

          {sendError ? (
            <View style={styles.sendError}>
              <FormError error={sendError} />
            </View>
          ) : null}

          {isBlocked ? (
            <ComposerNotice
              title="You cannot reply here"
              description="This conversation is closed because one of you is no longer able to message the other."
            />
          ) : (
            // The block check holds the SEND back rather than the whole
            // composer. Swapping a text placeholder in and the composer back
            // out resized the bottom of the screen a beat after it opened,
            // which moved the field out from under a thumb already reaching for
            // it — and cost the draft anyone had started typing.
            <Composer
              value={draft}
              onChangeText={setDraft}
              onSend={handleSend}
              sending={send.isPending}
              disabled={blocked.isPending && others.length > 0}
            />
          )}
        </KeyboardAvoidingView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.md,
  },
  older: {
    paddingVertical: spacing.md,
  },
  empty: {
    // The list is inverted, so its empty component is too. Flipping it back is
    // the only way the copy reads the right way up.
    transform: [{ scaleY: -1 }],
  },
  sendError: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingBottom: spacing.xs,
  },
});
