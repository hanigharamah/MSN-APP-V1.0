import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type {
  Conversation,
  ConversationParticipant,
  Message,
  Profile,
} from '@/types/database';
import { rangeFor, unwrap, unwrapMaybe } from './client';

/**
 * Messaging.
 *
 * `messages` and `conversations` are both published over Supabase Realtime
 * (migration 0005), which replaces the web app's Pusher setup. Subscribe with
 * `subscribeToMessages` and patch the React Query cache — do not poll.
 *
 * RLS shape:
 * - You see a conversation only if you are a participant.
 * - You may INSERT a message only as yourself, only into a conversation you
 *   are in, and only if nobody in it has blocked you. That last one arrives as
 *   a policy violation, so check `blocked_users` before showing the composer.
 */

export type ConversationWithParticipants = Conversation & {
  participants: (ConversationParticipant & {
    profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'handle'> | null;
  })[];
};

export type MessageWithSender = Message & {
  sender: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null;
};

const CONVERSATION_SELECT =
  '*, participants:conversation_participants(*, profile:profiles(id, display_name, avatar_url, handle))';

// -----------------------------------------------------------------------------
// Read
// -----------------------------------------------------------------------------

/**
 * Direct conversations to hide because the viewer has blocked the other person.
 *
 * One extra round trip, and only when the viewer has blocked somebody at all —
 * for everyone else this returns immediately without touching the network.
 *
 * Reads `blocked_users` under RLS, which is `blocker_id = auth.uid()`, so this
 * can only ever reflect the viewer's own blocks. Being blocked BY someone is
 * deliberately invisible here: it would leak a decision the blocker did not
 * share, and would make blocking unsafe for the person doing it.
 */
async function hiddenByBlockConversationIds(profileId: string): Promise<Set<string>> {
  const blocked = await unwrap(
    supabase.from('blocked_users').select('blocked_id').eq('blocker_id', profileId),
    'load your conversations',
  );
  if (blocked.length === 0) return new Set();

  const rows = await unwrap(
    supabase
      .from('conversation_participants')
      // `!inner` so the kind filter actually restricts the rows rather than
      // just nulling the embed.
      .select('conversation_id, conversation:conversations!inner(kind)')
      .in(
        'profile_id',
        blocked.map((row) => row.blocked_id),
      )
      .eq('conversation.kind', 'direct'),
    'load your conversations',
  );

  return new Set(rows.map((row) => row.conversation_id));
}

/**
 * The signed-in user's conversations, most recent first.
 *
 * RLS would scope this on its own, but the explicit filter on the participant
 * row lets Postgres use `conversation_participants_profile_idx` instead of
 * scanning.
 */
export async function listConversations(
  profileId: string,
  page = 0,
): Promise<ConversationWithParticipants[]> {
  const [from, to] = rangeFor(page);

  const memberships = await unwrap(
    supabase.from('conversation_participants').select('conversation_id').eq('profile_id', profileId),
    'load your conversations',
  );
  if (memberships.length === 0) return [];

  /*
   * Blocking has to remove the thread, not just the ability to reply.
   *
   * The confirmation says "you will not see messages from them", and it was not
   * true: the blocked person's conversation stayed in the list with their name,
   * avatar and last message preview, visually identical to any other. You only
   * discovered the block by tapping in. A promise the product does not keep is
   * worse than not making it.
   *
   * Only DIRECT threads are hidden. A group is something the viewer chose to be
   * part of, and silently removing it because one participant was blocked takes
   * away more than was asked for.
   *
   * Filtered out of the membership list rather than the fetched page, because
   * memberships is the complete set — excluding here keeps `range` paging exact,
   * where a post-fetch filter would return short pages.
   */
  const excluded = await hiddenByBlockConversationIds(profileId);
  const visible = memberships
    .map((row) => row.conversation_id)
    .filter((conversationId) => !excluded.has(conversationId));
  if (visible.length === 0) return [];

  return unwrap(
    supabase
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .in('id', visible)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .range(from, to)
      .returns<ConversationWithParticipants[]>(),
    'load your conversations',
  );
}

export async function getConversation(
  conversationId: string,
): Promise<ConversationWithParticipants | null> {
  return unwrapMaybe(
    supabase
      .from('conversations')
      .select(CONVERSATION_SELECT)
      .eq('id', conversationId)
      .maybeSingle()
      .returns<ConversationWithParticipants | null>(),
    'load that conversation',
  );
}

/**
 * A page of messages, newest first — which is the order a chat renders in when
 * the list is `inverted`. Reverse it if you are not inverting.
 */
export async function listMessages(
  conversationId: string,
  page = 0,
): Promise<MessageWithSender[]> {
  const [from, to] = rangeFor(page);
  return unwrap(
    supabase
      .from('messages')
      .select('*, sender:profiles(id, display_name, avatar_url)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<MessageWithSender[]>(),
    'load messages',
  );
}

/** Conversations with something newer than the viewer's `last_read_at`. */
export async function countUnreadConversations(profileId: string): Promise<number> {
  const rows = await unwrap(
    supabase
      .from('conversation_participants')
      .select('conversation_id, last_read_at, conversation:conversations(last_message_at)')
      .eq('profile_id', profileId)
      .returns<
        { conversation_id: string; last_read_at: string | null; conversation: { last_message_at: string | null } | null }[]
      >(),
    'check your messages',
  );

  return rows.filter((row) => {
    const lastMessage = row.conversation?.last_message_at;
    if (!lastMessage) return false;
    if (!row.last_read_at) return true;
    return new Date(lastMessage) > new Date(row.last_read_at);
  }).length;
}

// -----------------------------------------------------------------------------
// Write
// -----------------------------------------------------------------------------

export async function sendMessage(input: {
  conversationId: string;
  senderId: string;
  body?: string;
  attachmentUrl?: string;
  attachmentType?: string;
}): Promise<Message> {
  // `message_has_content` requires one or the other. Failing here beats a
  // check-constraint error the user cannot act on.
  if (!input.body?.trim() && !input.attachmentUrl) {
    throw new Error('sendMessage requires a body or an attachment.');
  }

  return unwrap(
    supabase
      .from('messages')
      .insert({
        conversation_id: input.conversationId,
        sender_id: input.senderId,
        body: input.body?.trim() ?? null,
        attachment_url: input.attachmentUrl ?? null,
        attachment_type: input.attachmentType ?? null,
      })
      .select('*')
      .single(),
    'send that message',
  );
}

export async function markConversationRead(
  conversationId: string,
  profileId: string,
): Promise<void> {
  await unwrapMaybe(
    supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('profile_id', profileId)
      .select('conversation_id'),
    'update your conversation',
  );
}

/**
 * Start (or reopen) a direct conversation with one person.
 *
 * Goes through `start_direct_conversation` (migration 0029) rather than
 * inserting rows, because inserting rows could not work: the participants
 * policy is `profile_id = auth.uid()`, so a client may only ever add ITSELF to
 * a conversation. Creating a two-party thread from here failed on the second
 * insert with "You do not have permission to do that" — every time, for
 * everybody. The seeded threads hid it, because the screens that read
 * conversations worked fine; only the door in was shut.
 *
 * The function also makes it atomic and idempotent. The old two-step could
 * leave an orphan conversation with one participant if the second call failed,
 * and tapping Message twice made two empty threads. Now the same person always
 * resolves to the same thread.
 *
 * Returns the conversation id — the caller navigates to it.
 */
export async function startDirectConversation(
  otherProfileId: string,
  bookingId?: string,
): Promise<string> {
  return unwrap(
    supabase.rpc('start_direct_conversation', {
      p_other: otherProfileId,
      p_booking: bookingId ?? undefined,
    }),
    'start that conversation',
  );
}

// -----------------------------------------------------------------------------
// Realtime
// -----------------------------------------------------------------------------

/**
 * Live messages for one conversation.
 *
 * Returns the channel — the caller MUST unsubscribe on unmount, or every
 * thread the user opens leaves a socket subscription behind:
 *
 *   useEffect(() => {
 *     const channel = subscribeToMessages(id, (message) => { ... });
 *     return () => { void channel.unsubscribe(); };
 *   }, [id]);
 *
 * The payload is a bare `messages` row — Realtime does not run the embedded
 * select, so `sender` is absent. Either join it from a profile cache or
 * refetch the row.
 */
export function subscribeToMessages(
  conversationId: string,
  onInsert: (message: Message) => void,
): RealtimeChannel {
  const topic = `messages:${conversationId}`;

  // `supabase.channel(topic)` returns an EXISTING registered channel when one
  // matches the topic — it does not always mint a new one. Attaching a
  // `postgres_changes` listener to a channel that is already joined or joining
  // throws `cannot add postgres_changes callbacks ... after subscribe()`, which
  // is the red screen this codebase documents in `notifications.ts`.
  //
  // Reachable whenever a previous teardown did not fully deregister — an
  // `unsubscribe()` that times out leaves the channel registered — or when the
  // same thread is opened twice in quick succession. Every other subscription
  // in the app sweeps first; this was the one that did not.
  for (const existing of supabase.getChannels()) {
    // The client prefixes topics with `realtime:`, so match on either form
    // rather than assuming which one `topic` is stored as.
    if (existing.topic === topic || existing.topic === `realtime:${topic}`) {
      void supabase.removeChannel(existing);
    }
  }

  return supabase
    .channel(topic)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onInsert(payload.new as Message),
    )
    .subscribe();
}

/** True when either party has blocked the other. Check before composing. */
/**
 * Can these two message each other?
 *
 * Goes through the `is_blocked_between` RPC, not a direct select. RLS lets you
 * read only blocks YOU created, so a plain query returns nothing for the one
 * case that matters — someone blocking you — and the composer would render
 * before the insert was silently refused.
 *
 * Keeping the row unreadable is deliberate: the caller learns it cannot send,
 * without learning who blocked whom. See migration 0015.
 *
 * `_a` is the viewer and is implied by `auth.uid()` inside the function; it
 * stays in the signature so call sites read symmetrically.
 */
export async function isBlockedBetween(_a: string, b: string): Promise<boolean> {
  return unwrap(supabase.rpc('is_blocked_between', { p_other: b }), 'check that conversation');
}
