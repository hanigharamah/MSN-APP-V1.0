/**
 * Messaging pieces — the conversation list row, the thread's bubbles and
 * separators, the composer, and the app-wide unread hook.
 *
 * Import from here rather than the individual files:
 *
 *   import { ConversationRow, MessageBubble } from '@/components/messaging';
 */
export { Composer } from './Composer';
export type { ComposerProps } from './Composer';

export { ComposerNotice } from './ComposerNotice';
export type { ComposerNoticeProps } from './ComposerNotice';

export { ConversationRow } from './ConversationRow';
export type { ConversationRowProps } from './ConversationRow';

export { DaySeparator } from './DaySeparator';
export type { DaySeparatorProps } from './DaySeparator';

export { MessageBubble } from './MessageBubble';
export type { MessageBubbleProps } from './MessageBubble';

export {
  conversationAvatar,
  conversationSubtitle,
  conversationTitle,
  isConversationUnread,
  otherParticipants,
  viewerParticipant,
} from './conversation-utils';
export type { ParticipantProfile } from './conversation-utils';

export { dayHeading, rowContext } from './message-groups';
export type { RowContext } from './message-groups';

export { useUnreadCounts } from './use-unread-counts';
