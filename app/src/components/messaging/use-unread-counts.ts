import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { qk } from '@/lib/queries/keys';
import { countUnreadConversations } from '@/lib/queries/messages';
import { subscribeToNotifications } from '@/lib/queries/notifications';
import { supabase } from '@/lib/supabase';

/**
 * App-wide unread state, and the one place it is kept fresh.
 *
 * ## Why the subscription lives here
 *
 * `subscribeToMessages` is scoped to a single conversation, so there is no
 * channel a list screen could use to hear about a message in a thread it has
 * not opened. `notifications` IS per-profile, and the fan-out that writes a
 * notification row is the same event that makes a conversation unread — so one
 * subscription to `notifications:<profile>` is enough to invalidate both
 * counters and the conversation list.
 *
 * Mount this ONCE, from the tab layout, which is alive for the whole session.
 * Mounting it per screen would contend for the same Realtime topic, and the
 * client does not tolerate two live subscriptions to one topic — the second
 * throws rather than merging.
 *
 * The cleanup is not optional. A channel left open survives the component,
 * keeps a websocket subscription alive, and delivers into a cache patch that
 * runs twice.
 */
export function useUnreadCounts(): { conversations: number } {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const profileId = session?.user.id ?? '';

  const conversations = useQuery({
    queryKey: qk.conversations.unreadCount(profileId),
    queryFn: () => countUnreadConversations(profileId),
    enabled: profileId !== '',
  });

  // Live: a new notification means something changed for this profile.
  useEffect(() => {
    if (profileId === '') return;

    const channel = subscribeToNotifications(profileId, () => {
      void queryClient.invalidateQueries({ queryKey: qk.conversations.all });
      void queryClient.invalidateQueries({ queryKey: qk.notifications.all });
    });

    return () => {
      // `removeChannel`, not `unsubscribe()`. The latter closes the channel but
      // leaves it registered with the Realtime client, so the next sign-in asks
      // for the same topic and gets the dead instance back — which then throws
      // when a listener is attached to it. See `subscribeToNotifications`.
      void supabase.removeChannel(channel);
    };
  }, [profileId, queryClient]);

  // Catch-up: Realtime does not deliver while the app is backgrounded, so the
  // counters are refreshed on the way back in rather than left stale.
  useEffect(() => {
    if (profileId === '') return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void queryClient.invalidateQueries({ queryKey: qk.conversations.unreadCount(profileId) });
      void queryClient.invalidateQueries({ queryKey: qk.notifications.all });
    });

    return () => {
      subscription.remove();
    };
  }, [profileId, queryClient]);

  return { conversations: conversations.data ?? 0 };
}
