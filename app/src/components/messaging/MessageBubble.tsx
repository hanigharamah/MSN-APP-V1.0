import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { formatMessageTime } from '@/lib/format';
import type { MessageWithSender } from '@/lib/queries/messages';
import { borderWidths, radii, spacing, useTheme } from '@/theme';

export interface MessageBubbleProps {
  message: MessageWithSender;
  /** Sent by the signed-in user — aligns right and fills with the accent. */
  isMine: boolean;
  /** First of a run by this sender: show their name (incoming only). */
  showSender: boolean;
  /** Name to print when `showSender`. Falls back to the embedded sender. */
  senderName?: string | null;
}

/**
 * One message.
 *
 * Alignment carries authorship, which is the convention every messaging app
 * shares and the reason bubbles do not need an avatar in a two-person thread.
 * Colour alone would not be enough — `accent` against `surface` is a strong
 * contrast, but a user with a colour-vision difference reads the side, not the
 * hue.
 *
 * Deleted messages keep their row (`deleted_at` is set, the row survives) and
 * render as a tombstone. Filtering them out would renumber the thread under
 * anyone reading it and make a realtime patch look like a bug.
 *
 * The whole bubble is ONE accessibility node with a composed label — sender,
 * body, time — rather than three separate stops per message.
 */
export function MessageBubble({ message, isMine, showSender, senderName }: MessageBubbleProps) {
  const theme = useTheme();

  const isDeleted = message.deleted_at !== null;
  const name = senderName ?? message.sender?.display_name ?? 'Someone';
  const time = formatMessageTime(message.created_at);

  const body = isDeleted
    ? 'Message deleted'
    : (message.body ?? (message.attachment_url ? 'Attachment' : ''));

  const bubbleStyle = {
    backgroundColor: isMine ? theme.colors.accent : theme.colors.surface,
    borderColor: isMine ? theme.colors.accent : theme.colors.border,
    borderWidth: borderWidths.hairline,
    borderBottomRightRadius: isMine ? radii.sm : radii.xxl,
    borderBottomLeftRadius: isMine ? radii.xxl : radii.sm,
  };

  return (
    <View style={[styles.row, isMine ? styles.mine : styles.theirs]}>
      {showSender && !isMine ? (
        <Text variant="caption" color="muted" style={styles.sender} numberOfLines={1}>
          {name}
        </Text>
      ) : null}

      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={`${isMine ? 'You' : name}: ${body || 'Attachment'}, ${time}`}
        style={[styles.bubble, bubbleStyle]}
      >
        {body ? (
          <Text
            variant="body"
            color={isMine ? 'onAccent' : 'primary'}
            style={isDeleted ? styles.deleted : undefined}
          >
            {body}
          </Text>
        ) : null}

        {!isDeleted && message.attachment_url && message.body ? (
          <Text variant="caption" color={isMine ? 'onAccent' : 'muted'} style={styles.attachment}>
            Attachment
          </Text>
        ) : null}

        <View style={styles.meta}>
          {message.edited_at && !isDeleted ? (
            <Text variant="caption" color={isMine ? 'onAccent' : 'muted'}>
              Edited ·{' '}
            </Text>
          ) : null}
          <Text variant="caption" color={isMine ? 'onAccent' : 'muted'}>
            {time}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: spacing.xxs,
    maxWidth: '86%',
  },
  mine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  theirs: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  sender: {
    marginBottom: spacing.xxs,
    marginHorizontal: spacing.xs,
  },
  bubble: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
  },
  deleted: {
    fontStyle: 'italic',
    opacity: 0.75,
  },
  attachment: {
    marginTop: spacing.xxs,
  },
  meta: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    marginTop: spacing.xxs,
    opacity: 0.85,
  },
});
