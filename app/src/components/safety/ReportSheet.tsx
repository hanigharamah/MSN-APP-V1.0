import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { FormError } from '@/components/auth/FormError';
import { Button, Card, Input, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { createReport, type ReportSubjectRef } from '@/lib/queries/safety';
import { borderWidths, SCREEN_GUTTER, spacing, useTheme } from '@/theme';
import {
  LISTING_REPORT_REASONS,
  PERSON_REPORT_REASONS,
  type ReportReason,
} from './report-reasons';

export interface ReportSheetProps {
  visible: boolean;
  onClose: () => void;
  /** What is being reported. Exactly one of the three ids. */
  subject: ReportSubjectRef;
  /** Named in the heading so nobody reports the wrong thing by accident. */
  subjectLabel: string;
}

/**
 * Report a person, an event or a message.
 *
 * ## Why this exists
 *
 * Admin could already action reports; nothing could file one. That is not just
 * a gap in the product — App Store guideline 1.2 requires apps carrying
 * user-generated content to give people a way to report it, so without this
 * the app cannot ship at all.
 *
 * ## The shape
 *
 * Reason first, then optional words. The reason is what a moderator sorts a
 * queue by; the words are what they read once they get there. Submitting is
 * one tap after choosing, because someone filing this may be upset and should
 * not have to compose an essay to be heard.
 *
 * ## What it promises
 *
 * Nothing about the outcome, deliberately. The confirmation says a person will
 * look — it does not say what will happen, because the moderator has not
 * decided yet, and a report that reads like a verdict sets up a second
 * complaint when nothing visible changes. Reporters are not notified either
 * way; that is stated on the admin side too, so both halves agree.
 */
export function ReportSheet({ visible, onClose, subject, subjectLabel }: ReportSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* Remounted per open, so a half-written report from last time never
          reappears attached to a different person. */}
      {visible ? (
        <ReportForm subject={subject} subjectLabel={subjectLabel} onClose={onClose} />
      ) : null}
    </Modal>
  );
}

function ReportForm({
  subject,
  subjectLabel,
  onClose,
}: {
  subject: ReportSubjectRef;
  subjectLabel: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { session } = useAuth();

  const reasons: readonly ReportReason[] =
    subject.kind === 'event' ? LISTING_REPORT_REASONS : PERSON_REPORT_REASONS;

  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [sent, setSent] = useState(false);

  const submit = useMutation({
    mutationFn: () => {
      if (!session) throw new Error('unreachable: report form open with no session');
      if (reason === null) throw new Error('unreachable: submit with no reason');
      return createReport({
        reporterId: session.user.id,
        subject,
        reason,
        detail: detail.trim() ? detail.trim() : null,
      });
    },
    onSuccess: () => setSent(true),
  });

  if (sent) {
    return (
      <View style={[styles.page, { paddingTop: spacing.lg }]}>
        <Text variant="h3" heading={1}>
          Thank you
        </Text>
        <Text variant="body" color="secondary">
          {subject.kind === 'event'
            ? `Someone at My Source Network will read this and look at the listing. The host is never told who reported it.`
            : `Someone at My Source Network will read this and decide what to do. ${subjectLabel} is never told who reported them.`}
        </Text>
        <Text variant="bodySmall" color="muted">
          You will not hear back about the outcome, but the report is on record
          and counts if it happens again.
        </Text>
        <Button label="Done" onPress={onClose} style={styles.action} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <View
        style={[
          styles.header,
          {
            // A `pageSheet` modal is already inset from the top of the screen —
            // it does not start under the status bar. Adding the full safe-area
            // inset again left an empty band above the header.
            paddingTop: spacing.md,
            borderBottomColor: theme.colors.border,
          },
        ]}
      >
        <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} />
        <Text variant="bodyStrong">Report</Text>
        <Button
          label="Send"
          size="sm"
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={reason === null}
        />
      </View>

      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text variant="h4" heading={1}>
          {`What is wrong with ${subjectLabel}?`}
        </Text>

        {submit.isError ? <FormError error={submit.error} /> : null}

        <Card variant="outlined" padding="sm">
          {reasons.map((option, index) => {
            const selected = reason === option.value;
            return (
              <Button
                key={option.value}
                label={option.label}
                variant={selected ? 'secondary' : 'ghost'}
                fullWidth
                onPress={() => setReason(option.value)}
                accessibilityLabel={`${selected ? 'Selected. ' : ''}${option.label}. ${option.hint}`}
                style={index === reasons.length - 1 ? undefined : styles.reason}
              />
            );
          })}
        </Card>

        {reason !== null ? (
          <Text variant="bodySmall" color="muted">
            {reasons.find((option) => option.value === reason)?.hint}
          </Text>
        ) : null}

        <Input
          label="Anything else we should know?"
          value={detail}
          onChangeText={setDetail}
          multiline
          numberOfLines={4}
          hint="Optional. Dates, what was said, or anything that helps us understand."
          placeholder="What happened"
        />

        <Text variant="caption" color="muted">
          Reports are read by My Source Network. The person you are reporting is
          never told who filed it.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_GUTTER,
    paddingBottom: spacing.sm,
    borderBottomWidth: borderWidths.hairline,
  },
  page: { padding: SCREEN_GUTTER, gap: spacing.md },
  reason: { marginBottom: spacing.xxs },
  action: { alignSelf: 'flex-start' },
});
