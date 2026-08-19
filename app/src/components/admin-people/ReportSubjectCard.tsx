import { StyleSheet, View } from 'react-native';

import { Avatar, Badge, Button, Card, Skeleton, Text, eventStatusBadge } from '@/components/ui';
import { formatEventRange, formatMessageTime, timeZoneSuffix } from '@/lib/format';
import { borderWidths, radii, spacing, useTheme } from '@/theme';
import type { ReportSubject, ReportedMessage } from './admin-queries';
import { accountTypeLabel, standingBadges, standingSummary } from './standing';

export interface ReportSubjectCardProps {
  subject: ReportSubject;
  /** The reported message plus its neighbours. Undefined while still loading. */
  messageContext?: readonly ReportedMessage[];
  contextLoading?: boolean;
  /** Opens the account behind whatever was reported. Null when there isn't one. */
  onOpenAccount: (() => void) | null;
}

/**
 * The reported thing, shown as it exists — not as a foreign key.
 *
 * A report screen that says "profile 4f3c…" and offers Suspend is a screen
 * that produces bad suspensions. Whatever was reported is rendered here in
 * enough context to judge it: an account with its standing, an event with its
 * status and dates, a message with the lines either side of it.
 */
export function ReportSubjectCard({
  subject,
  messageContext,
  contextLoading = false,
  onOpenAccount,
}: ReportSubjectCardProps) {
  const theme = useTheme();

  if (subject.kind === 'missing') {
    return (
      <Card variant="outlined" style={styles.card}>
        <Text variant="h4" heading={2}>
          What was reported
        </Text>
        <Text variant="bodySmall" color="secondary">
          The reported item no longer exists. It was deleted, or the account it belonged to was.
          You can still close this report — nothing else here will act on it.
        </Text>
      </Card>
    );
  }

  if (subject.kind === 'profile') {
    const profile = subject.profile;
    return (
      <Card variant="outlined" style={styles.card}>
        <Text variant="h4" heading={2}>
          Reported account
        </Text>

        <View
          style={styles.identity}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${profile.display_name}, ${standingSummary(profile)}`}
        >
          <Avatar uri={profile.avatar_url} name={profile.display_name} size="lg" />
          <View style={styles.identityText}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {profile.display_name}
            </Text>
            {profile.handle ? (
              <Text variant="caption" color="muted">
                {`@${profile.handle}`}
              </Text>
            ) : null}
            {profile.headline ? (
              <Text variant="caption" color="secondary" numberOfLines={2}>
                {profile.headline}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.badges}>
          <Badge label={accountTypeLabel(profile.account_type)} tone="neutral" />
          {standingBadges(profile).map((badge) => (
            <Badge key={badge.key} label={badge.label} tone={badge.tone} />
          ))}
        </View>

        {profile.bio ? (
          <Text variant="bodySmall" color="secondary" numberOfLines={6}>
            {profile.bio}
          </Text>
        ) : null}

        {onOpenAccount ? (
          <Button
            label="Open full account"
            variant="secondary"
            onPress={onOpenAccount}
            fullWidth
            accessibilityHint="Shows their activity, listings and every decision available for this account"
          />
        ) : null}
      </Card>
    );
  }

  if (subject.kind === 'event') {
    const event = subject.event;
    const status = eventStatusBadge(event.status);
    const suffix = timeZoneSuffix(event.timezone, event.starts_at);

    return (
      <Card variant="outlined" style={styles.card}>
        <Text variant="h4" heading={2}>
          Reported event
        </Text>

        <View style={styles.head}>
          <Text variant="bodyStrong" style={styles.flex} numberOfLines={3}>
            {event.title}
          </Text>
          <Badge label={status.label} tone={status.tone} />
        </View>

        <Text variant="caption" color="muted">
          {`${formatEventRange(event.starts_at, event.ends_at, event.timezone)}${suffix ? ` ${suffix}` : ''}`}
        </Text>

        <Text variant="bodySmall" color="secondary">
          {`Hosted by ${event.host?.display_name ?? 'a deleted account'}`}
        </Text>

        {event.summary ? (
          <Text variant="bodySmall" color="secondary" numberOfLines={6}>
            {event.summary}
          </Text>
        ) : null}

        {onOpenAccount ? (
          <Button
            label="Open host's account"
            variant="secondary"
            onPress={onOpenAccount}
            fullWidth
            accessibilityHint="Shows the host's activity and every decision available for their account"
          />
        ) : null}
      </Card>
    );
  }

  // --- message ---------------------------------------------------------------
  const reportedId = subject.message.id;
  const thread = messageContext ?? [subject.message];

  return (
    <Card variant="outlined" style={styles.card}>
      <Text variant="h4" heading={2}>
        Reported message
      </Text>

      <Text variant="caption" color="muted">
        The reported line is highlighted. The messages around it are shown so it can be read in
        context.
      </Text>

      <View style={styles.thread}>
        {contextLoading ? <Skeleton height={56} radius="lg" /> : null}

        {thread.map((message) => {
          const isSubject = message.id === reportedId;
          return (
            <View
              key={message.id}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${isSubject ? 'Reported message. ' : ''}${message.sender?.display_name ?? 'Deleted account'} at ${formatMessageTime(message.created_at)}: ${messageBody(message)}`}
              style={[
                styles.bubble,
                {
                  borderRadius: radii.lg,
                  borderWidth: borderWidths.hairline,
                  backgroundColor: isSubject
                    ? theme.colors.dangerSubtle
                    : theme.colors.surfaceMuted,
                  borderColor: isSubject ? theme.colors.dangerBorder : theme.colors.border,
                },
              ]}
            >
              <View style={styles.bubbleHead}>
                <Text variant="label" color={isSubject ? 'danger' : 'secondary'} numberOfLines={1}>
                  {message.sender?.display_name ?? 'Deleted account'}
                </Text>
                <Text variant="caption" color="muted">
                  {formatMessageTime(message.created_at)}
                </Text>
              </View>

              <Text variant="bodySmall" color={message.body ? 'primary' : 'muted'}>
                {messageBody(message)}
              </Text>
            </View>
          );
        })}
      </View>

      {onOpenAccount ? (
        <Button
          label="Open sender's account"
          variant="secondary"
          onPress={onOpenAccount}
          fullWidth
          accessibilityHint="Shows the sender's activity and every decision available for their account"
        />
      ) : null}
    </Card>
  );
}

/**
 * What to show for a message with no body.
 *
 * `deleted_at` matters here: a message the sender wiped after being reported is
 * itself evidence, and rendering it as blank would lose that.
 */
function messageBody(message: ReportedMessage): string {
  if (message.deleted_at !== null) return 'Deleted by the sender after it was sent.';
  if (message.body) return message.body;
  if (message.attachment_url) return `Attachment (${message.attachment_type ?? 'unknown type'}).`;
  return 'Empty message.';
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  identityText: {
    flex: 1,
    gap: spacing.xxs,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  thread: {
    gap: spacing.xs,
  },
  bubble: {
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  bubbleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
