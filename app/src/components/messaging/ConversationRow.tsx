import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components/ui';
import { formatMessageTime } from '@/lib/format';
import type { ConversationWithParticipants } from '@/lib/queries/messages';
import { borderWidths, spacing, useTheme } from '@/theme';
import {
  conversationAvatar,
  conversationSubtitle,
  conversationTitle,
  isConversationUnread,
} from './conversation-utils';

export interface ConversationRowProps {
  conversation: ConversationWithParticipants;
  viewerId: string;
  onPress: (conversationId: string) => void;
}

/**
 * One row in the Messages tab.
 *
 * The whole row is a single accessible button with a composed label — name,
 * what the thread is about, when it last moved, and whether it is unread.
 * Five separate stops per conversation would make the tab unusable with
 * VoiceOver, and the unread dot in particular is invisible to a screen reader
 * unless it is spoken as part of the row.
 */
export function ConversationRow({ conversation, viewerId, onPress }: ConversationRowProps) {
  const theme = useTheme();

  const title = conversationTitle(conversation, viewerId);
  const subtitle = conversationSubtitle(conversation, viewerId);
  const other = conversationAvatar(conversation, viewerId);
  const unread = isConversationUnread(conversation, viewerId);
  const timestamp = conversation.last_message_at
    ? formatMessageTime(conversation.last_message_at)
    : null;

  const label = [
    title,
    subtitle,
    timestamp ? `Last activity ${timestamp}` : 'No messages yet',
    unread ? 'Unread' : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      onPress={() => onPress(conversation.id)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the conversation"
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: theme.colors.border,
          borderBottomWidth: borderWidths.hairline,
          backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
        },
      ]}
    >
      <Avatar uri={other?.avatar_url ?? null} name={other?.display_name ?? title} size="lg" />

      <View style={styles.copy}>
        <Text variant={unread ? 'bodyStrong' : 'body'} numberOfLines={1}>
          {title}
        </Text>
        {/* Two lines, matching the 140-character truncation the trigger writes
            into `last_message_preview`. One line clips most real messages after
            three or four words, which is not enough to tell two threads apart. */}
        <Text variant="bodySmall" color={unread ? 'secondary' : 'muted'} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.trailing}>
        {timestamp ? (
          <Text variant="caption" color={unread ? 'accent' : 'muted'}>
            {timestamp}
          </Text>
        ) : null}
        {unread ? (
          <View style={[styles.dot, { backgroundColor: theme.colors.accent }]} />
        ) : (
          <View style={styles.dot} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    // The row is 48pt of avatar plus padding, comfortably over the 44 minimum.
    minHeight: 72,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
