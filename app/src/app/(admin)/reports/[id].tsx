import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AdminNotice } from '@/components/admin';
import {
  Consequences,
  ReportSubjectCard,
  adminKeys,
  confirmAction,
  confirmDestructive,
  getMessageContext,
  getReport,
  listPriorReports,
  getReportSubject,
  resolveReport,
  setAccountSuspended,
  ticketsSoldForEvent,
  unpublishEvent,
} from '@/components/admin-people';
import type { ReportSubject } from '@/components/admin-people';
import type { Report } from '@/types/database';
import { InlineError } from '@/components/events';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Input, Screen, Skeleton, Text } from '@/components/ui';
import { useRequiredUserId } from '@/context/AuthContext';
import { formatLocal, formatRelative } from '@/lib/format';
import { qk } from '@/lib/queries/keys';
import { spacing } from '@/theme';

/**
 * One report.
 *
 * ## The shape of the decision
 *
 * A report is a person saying "look at this". The operator's job is to look at
 * the thing, not at a foreign key — so the reported item is fetched and
 * rendered in context (a message arrives with the lines either side of it), and
 * only then are the two outcomes offered: close it, or act and close it.
 *
 * ## The outcome is derived, not asked for
 *
 * Every button here already implies its verdict — suspending someone IS
 * upholding the report, closing without acting IS dismissing it. So the screen
 * never makes the operator pick an outcome from a list after they have already
 * made the decision by pressing a button. It records what the press meant.
 *
 * The note is optional and is the only thing typed here. It is written for the
 * next moderator who opens a report about this same account, and it is internal
 * — neither the reporter nor the person reported ever sees it.
 *
 * ## Acting is two writes, not one
 *
 * Suspending and then resolving are separate statements and there is no
 * transaction across them. If the second fails the first stands — so the screen
 * refetches and the operator sees a suspended account with an open report,
 * which is recoverable in one tap. The alternative, an Edge Function, is not
 * worth it for a two-row change an operator is watching happen.
 */
const OUTCOME_LABEL: Record<NonNullable<Report['outcome']>, string> = {
  upheld: 'Upheld',
  dismissed: 'Dismissed',
  duplicate: 'Closed as a duplicate',
};

export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const adminId = useRequiredUserId();

  const report = useQuery({
    queryKey: adminKeys.reports.detail(id),
    queryFn: () => getReport(id),
    enabled: Boolean(id),
  });

  const reportRow = report.data ?? null;

  const subject = useQuery({
    queryKey: adminKeys.reports.subject(id),
    queryFn: () => {
      // `enabled` guarantees this, but the closure cannot know that.
      if (!reportRow) throw new Error('unreachable: subject query ran without a report');
      return getReportSubject(reportRow);
    },
    enabled: reportRow !== null,
  });

  const subjectData = subject.data;
  const reportedMessage = subjectData?.kind === 'message' ? subjectData.message : null;

  const context = useQuery({
    queryKey: adminKeys.reports.messageContext(id),
    queryFn: () => {
      if (!reportedMessage) throw new Error('unreachable: context query ran without a message');
      return getMessageContext(reportedMessage);
    },
    enabled: reportedMessage !== null,
  });

  const reportedEvent = subjectData?.kind === 'event' ? subjectData.event : null;

  // Only asked for a published event, because it is only used to warn about
  // what an unpublish strands.
  const ticketsSold = useQuery({
    queryKey: [...qk.events.ticketTypes(reportedEvent?.id ?? 'none'), 'sold-total'],
    queryFn: () => {
      if (!reportedEvent) throw new Error('unreachable: ticket query ran without an event');
      return ticketsSoldForEvent(reportedEvent.id);
    },
    enabled: reportedEvent !== null && reportedEvent.status === 'published',
  });

  // Optional, and deliberately not cleared on error — a moderator who typed a
  // paragraph and hit a network failure should not lose it.
  const [note, setNote] = useState('');

  // The history that `outcome` was added to make possible. Only for a person —
  // a reported event or message has no standing of its own to weigh.
  const priorSubjectId = reportRow?.subject_profile_id ?? null;
  const prior = useQuery({
    queryKey: adminKeys.reports.prior(id),
    queryFn: () => {
      if (!priorSubjectId) throw new Error('unreachable: prior query ran without a subject');
      return listPriorReports(priorSubjectId, id);
    },
    enabled: priorSubjectId !== null,
  });
  const priorReports = prior.data ?? [];

  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.reports.all });
    void queryClient.invalidateQueries({ queryKey: qk.profiles.all });
    void queryClient.invalidateQueries({ queryKey: qk.events.all });
  };

  // Closing without acting IS a dismissal; acting on the subject IS upholding
  // the report. The operator states the verdict by choosing a button.
  const close = useMutation({
    mutationFn: () => resolveReport(id, adminId, 'dismissed', note),
    onSuccess: settle,
  });

  const suspendAndClose = useMutation({
    mutationFn: async (accountId: string) => {
      await setAccountSuspended(accountId, true);
      await resolveReport(id, adminId, 'upheld', note);
    },
    onSuccess: settle,
  });

  const unpublishAndClose = useMutation({
    mutationFn: async (eventId: string) => {
      await unpublishEvent(eventId);
      await resolveReport(id, adminId, 'upheld', note);
    },
    onSuccess: settle,
  });

  if (report.isPending) {
    return (
      <Screen safeBottom>
        <Stack.Screen options={{ title: 'Report' }} />
        <View style={styles.page} accessibilityLiveRegion="polite" accessibilityLabel="Loading report">
          <Skeleton height={120} radius="lg" />
          <Skeleton height={220} radius="lg" />
        </View>
      </Screen>
    );
  }

  if (report.isError) {
    return (
      <Screen safeBottom>
        <Stack.Screen options={{ title: 'Report' }} />
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      </Screen>
    );
  }

  if (!reportRow) {
    return (
      <Screen safeBottom>
        <Stack.Screen options={{ title: 'Report' }} />
        <EmptyState
          icon="flag-outline"
          title="No such report"
          description="It has been deleted, or the link is wrong."
        />
      </Screen>
    );
  }

  const resolved = reportRow.resolved_at !== null;
  const busy = close.isPending || suspendAndClose.isPending || unpublishAndClose.isPending;
  const mutationError = close.error ?? suspendAndClose.error ?? unpublishAndClose.error;

  const accountId = subjectData ? accountBehind(subjectData) : null;
  const accountName = subjectData ? nameBehind(subjectData) : null;
  const accountSuspended = subjectData ? suspendedBehind(subjectData) : false;

  return (
    <Screen scroll safeBottom>
      <Stack.Screen options={{ title: resolved ? 'Closed report' : 'Report' }} />

      <View style={styles.page}>
        {/* --- Who said what ------------------------------------------------ */}
        <Card variant="outlined" style={styles.card}>
          <View style={styles.cardHead}>
            <Text variant="h4" heading={1}>
              Reported {formatRelative(reportRow.created_at)}
            </Text>
            <Badge
              label={resolved ? 'Closed' : 'Open'}
              tone={resolved ? 'neutral' : 'warning'}
            />
          </View>

          <View style={styles.reporter}>
            <Avatar
              uri={reportRow.reporter?.avatar_url ?? null}
              name={reportRow.reporter?.display_name ?? 'Deleted account'}
              size="sm"
            />
            <Text variant="bodySmall" color="secondary" style={styles.flex} numberOfLines={2}>
              {`Reported by ${reportRow.reporter?.display_name ?? 'a deleted account'}`}
            </Text>
          </View>

          <View style={styles.reason}>
            <Text variant="label" color="secondary">
              Reason given
            </Text>
            <Text variant="bodyStrong">{reasonLabel(reportRow.reason)}</Text>
            {reportRow.detail ? (
              <Text variant="bodySmall" color="secondary">
                {reportRow.detail}
              </Text>
            ) : (
              <Text variant="bodySmall" color="muted">
                No further detail was given.
              </Text>
            )}
          </View>
        </Card>

        {/* --- What was reported -------------------------------------------- */}
        {subject.isPending ? (
          <Skeleton height={220} radius="lg" />
        ) : subject.isError ? (
          <InlineError error={subject.error} onRetry={() => void subject.refetch()} />
        ) : subjectData ? (
          <ReportSubjectCard
            subject={subjectData}
            messageContext={context.data}
            contextLoading={context.isPending && reportedMessage !== null}
            onOpenAccount={
              accountId ? () => router.push(`/(admin)/people/${accountId}`) : null
            }
          />
        ) : null}

        {context.isError ? (
          <InlineError error={context.error} onRetry={() => void context.refetch()} />
        ) : null}

        {/* --- What happened last time ---------------------------------------- */}
        {priorReports.length > 0 ? (
          <Card variant="outlined" style={styles.card}>
            <Text variant="h4" heading={2}>
              {priorReports.length === 1
                ? 'One earlier report about this person'
                : `${priorReports.length} earlier reports about this person`}
            </Text>
            {priorReports.map((earlier) => (
              <View key={earlier.id} style={styles.prior}>
                <Text variant="bodySmall">
                  {`${OUTCOME_LABEL[earlier.outcome ?? 'dismissed']} · ${formatRelative(earlier.created_at)}`}
                </Text>
                <Text variant="bodySmall" color="muted">
                  {earlier.resolution_note?.trim() || earlier.reason}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {/* --- The decision -------------------------------------------------- */}
        {resolved ? (
          <Card variant="outlined" style={styles.card}>
            <Text variant="h4" heading={2}>
              Already closed
            </Text>
            <AdminNotice
              tone={reportRow.outcome === 'upheld' ? 'warning' : 'info'}
              title={`${OUTCOME_LABEL[reportRow.outcome ?? 'dismissed']} by ${reportRow.resolver?.display_name ?? 'an admin'} on ${formatLocal(reportRow.resolved_at ?? reportRow.created_at)}.`}
              body={
                reportRow.resolution_note?.trim()
                  ? reportRow.resolution_note
                  : reportRow.outcome
                    ? 'No note was left.'
                    : 'This was closed before outcomes were recorded, so what was decided is not known. If it needs revisiting, open the account and read its current standing.'
              }
            />
          </Card>
        ) : (
          <Card variant="outlined" style={styles.card}>
            <Text variant="h4" heading={2}>
              Resolve this report
            </Text>

            {mutationError ? <InlineError error={mutationError} /> : null}

            <Consequences
              items={[
                'Closing stamps your name, the time and what you decided on the report. Whoever handles the next report about this account will see it.',
                'The person who reported this is not notified either way.',
              ]}
            />

            <Input
              label="Note for the next moderator"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              editable={!busy}
              hint="Optional, and internal. Neither the reporter nor the person reported sees this."
              placeholder="What you saw, and why you decided this way"
            />

            <Button
              label="Close — no action needed"
              variant="secondary"
              fullWidth
              loading={close.isPending}
              disabled={busy && !close.isPending}
              accessibilityHint="Marks the report handled without changing anything about the reported account or listing"
              onPress={() =>
                confirmAction({
                  title: 'Close without acting?',
                  message:
                    'The report is marked handled with your name on it. Nothing about the reported account or listing changes.',
                  confirmLabel: 'Close report',
                  onConfirm: () => close.mutate(),
                })
              }
            />

            {/* Suspend — offered for a reported profile, and for the sender of
                a reported message, because in both cases the account is the
                thing that can be acted on. */}
            {accountId && accountName ? (
              accountSuspended ? (
                <Text variant="bodySmall" color="muted">
                  {`${accountName} is already suspended. Close the report when you have finished looking.`}
                </Text>
              ) : (
                <Button
                  label={`Suspend ${accountName} and close`}
                  variant="danger"
                  fullWidth
                  loading={suspendAndClose.isPending}
                  disabled={busy && !suspendAndClose.isPending}
                  accessibilityHint="Hides that account from the marketplace and marks the report handled. Their bookings are not cancelled."
                  onPress={() =>
                    confirmDestructive({
                      title: `Suspend ${accountName}?`,
                      message: `${accountName} disappears from the marketplace immediately. Their existing bookings are NOT cancelled — those stay on both calendars and still block that time. Nobody is refunded and nobody is told.`,
                      confirmLabel: 'Suspend and close',
                      onConfirm: () => suspendAndClose.mutate(accountId),
                    })
                  }
                />
              )
            ) : null}

            {/* Unpublish — only for a reported event that is actually live. */}
            {reportedEvent ? (
              reportedEvent.status === 'published' ? (
                <Button
                  label="Unpublish the event and close"
                  variant="danger"
                  fullWidth
                  loading={unpublishAndClose.isPending}
                  disabled={busy && !unpublishAndClose.isPending}
                  accessibilityHint="Returns the event to draft so nobody can find or book it, and marks the report handled"
                  onPress={() =>
                    confirmDestructive({
                      title: 'Unpublish this event?',
                      message: unpublishMessage(reportedEvent.title, ticketsSold.data ?? null),
                      confirmLabel: 'Unpublish and close',
                      onConfirm: () => unpublishAndClose.mutate(reportedEvent.id),
                    })
                  }
                />
              ) : (
                <Text variant="bodySmall" color="muted">
                  This event is not live, so there is nothing to unpublish.
                </Text>
              )
            ) : null}

            {subjectData?.kind === 'missing' ? (
              <Text variant="bodySmall" color="muted">
                The reported item is gone, so closing the report is the only thing left to do.
              </Text>
            ) : null}
          </Card>
        )}
      </View>
    </Screen>
  );
}

/**
 * `reports.reason` is plain `text` with no CHECK and no enum behind it, and
 * there is no report-creation UI anywhere in the app to establish a convention.
 * What is in the table is `off_platform_payment`-style tokens.
 *
 * So: a token (one word, underscores, no spaces) is humanised; anything with a
 * space is treated as prose the reporter typed and rendered verbatim. Getting
 * that backwards would either show an operator `misleading_listing` or mangle a
 * sentence someone wrote.
 *
 * TODO(agent · admin): give `reports.reason` a CHECK constraint or an enum in a
 * migration, and drop this guess.
 */
function reasonLabel(reason: string): string {
  if (reason.includes(' ')) return reason;
  const words = reason.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The account an action would land on, if there is one. */
function accountBehind(subject: ReportSubject): string | null {
  switch (subject.kind) {
    case 'profile':
      return subject.profile.id;
    case 'event':
      return subject.event.host?.id ?? null;
    case 'message':
      return subject.message.sender?.id ?? null;
    case 'missing':
      return null;
  }
}

function nameBehind(subject: ReportSubject): string | null {
  switch (subject.kind) {
    case 'profile':
      return subject.profile.display_name;
    case 'event':
      return subject.event.host?.display_name ?? null;
    case 'message':
      return subject.message.sender?.display_name ?? null;
    case 'missing':
      return null;
  }
}

function suspendedBehind(subject: ReportSubject): boolean {
  switch (subject.kind) {
    case 'profile':
      return subject.profile.is_suspended;
    case 'event':
      return subject.event.host?.is_suspended ?? false;
    case 'message':
      return subject.message.sender?.is_suspended ?? false;
    case 'missing':
      return false;
  }
}

function unpublishMessage(title: string, ticketsSold: number | null): string {
  const stranded =
    ticketsSold === null
      ? 'Anyone who already has a ticket keeps it, and is not refunded or told.'
      : ticketsSold > 0
        ? `${ticketsSold} ${ticketsSold === 1 ? 'ticket has' : 'tickets have'} already been sold. Those holders keep their tickets and are not refunded or told.`
        : 'No tickets have been sold, so nobody is left holding one.';

  return `"${title}" goes back to draft and stops appearing anywhere in the app. ${stranded} The host can publish it again once whatever is wrong is fixed.`;
}

const styles = StyleSheet.create({
  prior: { gap: spacing.xxs },
  page: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    gap: spacing.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  reporter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reason: {
    gap: spacing.xxs,
  },
  flex: {
    flex: 1,
  },
});
