import type { ConversationWithParticipants } from '@/lib/queries/messages';
import type { ConversationKind, Profile } from '@/types/database';

/**
 * Derivations shared by the conversation list and the thread.
 *
 * A `conversations` row says almost nothing on its own — who a thread is with
 * lives in `conversation_participants`, and every screen needs the same three
 * answers: who is the other side, is there anything new, and what is this
 * thread about. Keeping them here means the list row and the thread header
 * cannot disagree about a name.
 */

/** The participant profile shape `CONVERSATION_SELECT` embeds. */
export type ParticipantProfile = Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'handle'>;

/** Everyone in the conversation except the viewer, with a loadable profile. */
export function otherParticipants(
  conversation: ConversationWithParticipants,
  viewerId: string,
): ParticipantProfile[] {
  return conversation.participants
    .filter((participant) => participant.profile_id !== viewerId)
    .flatMap((participant) => (participant.profile ? [participant.profile] : []));
}

/**
 * The viewer's own participant row — the one carrying `last_read_at`.
 *
 * Undefined only if RLS returned a conversation the viewer is not in, which
 * cannot happen; callers still have to handle it rather than assert.
 */
export function viewerParticipant(conversation: ConversationWithParticipants, viewerId: string) {
  return conversation.participants.find((participant) => participant.profile_id === viewerId);
}

/** "Maya Ellis", "Maya Ellis and 2 others", or a fallback that is never blank. */
export function conversationTitle(
  conversation: ConversationWithParticipants,
  viewerId: string,
): string {
  const others = otherParticipants(conversation, viewerId);
  const [first, second] = others;

  if (!first) return 'Conversation';
  if (others.length === 1) return first.display_name;
  if (others.length === 2 && second) return `${first.display_name} and ${second.display_name}`;
  return `${first.display_name} and ${others.length - 1} others`;
}

/** Avatar for the row. Groups fall back to the first participant's picture. */
export function conversationAvatar(
  conversation: ConversationWithParticipants,
  viewerId: string,
): ParticipantProfile | null {
  return otherParticipants(conversation, viewerId)[0] ?? null;
}

const KIND_LABEL: Record<ConversationKind, string> = {
  direct: 'Direct message',
  booking: 'About a booking',
  event: 'About an event',
};

/** First word of a display name — "Maya" out of "Maya Okonkwo". */
function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

/**
 * The secondary line on a conversation row: the last message, the way every
 * other inbox in the world shows it.
 *
 * Migration 0012 denormalised `last_message_preview` (truncated to 140 chars at
 * write time) and `last_message_sender_id` onto `conversations`, maintained by
 * the same `bump_conversation` trigger that already kept `last_message_at`
 * honest. That is what makes this possible without an N+1 — PostgREST still
 * cannot express "newest child row per parent", so reading the body per row
 * from the client would be one request and up to 20 message rows for every
 * conversation on screen, on every visit to the tab.
 *
 * Attribution matters more than it looks. "You: see you Tuesday" tells someone
 * the ball is in the other person's court; the bare body does not. In a group
 * thread the sender's first name does the same job. A thread with no messages
 * yet has no preview, so it falls back to who it is with, or what it is about.
 */
export function conversationSubtitle(
  conversation: ConversationWithParticipants,
  viewerId: string,
): string {
  const preview = conversation.last_message_preview?.trim();

  if (preview) {
    if (conversation.last_message_sender_id === viewerId) return `You: ${preview}`;

    const others = otherParticipants(conversation, viewerId);
    // Only a group needs the name — in a two-person thread the row's title is
    // already the sender, and repeating it wastes the line.
    if (others.length > 1) {
      const sender = others.find(
        (participant) => participant.id === conversation.last_message_sender_id,
      );
      if (sender) return `${firstName(sender.display_name)}: ${preview}`;
    }
    return preview;
  }

  if (conversation.kind !== 'direct') return KIND_LABEL[conversation.kind];

  const [first] = otherParticipants(conversation, viewerId);
  if (first?.handle) return `@${first.handle}`;
  return KIND_LABEL.direct;
}

/**
 * Something arrived after the viewer last opened the thread.
 *
 * The sender check is not a nicety. `last_message_at` moves when the VIEWER
 * sends too, so without it every message you send marks your own conversation
 * unread the moment you leave the thread — a magenta dot and a tab badge for
 * your own words. `last_message_sender_id` (migration 0012) is what makes the
 * distinction expressible; it is null only on rows that predate the backfill,
 * where the old timestamp-only rule still applies.
 */
export function isConversationUnread(
  conversation: ConversationWithParticipants,
  viewerId: string,
): boolean {
  const lastMessageAt = conversation.last_message_at;
  if (!lastMessageAt) return false;
  if (conversation.last_message_sender_id === viewerId) return false;

  const participant = viewerParticipant(conversation, viewerId);
  if (!participant?.last_read_at) return true;

  return new Date(lastMessageAt).getTime() > new Date(participant.last_read_at).getTime();
}
