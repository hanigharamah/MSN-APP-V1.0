import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { FormError } from '@/components/auth/FormError';
import { Button, Card, Skeleton, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { formatLocal } from '@/lib/format';
import { qk } from '@/lib/queries/keys';
import { accountDeletionBlockers, requestAccountDeletion } from '@/lib/queries/safety';
import { borderWidths, SCREEN_GUTTER, spacing, useTheme } from '@/theme';

export interface DeleteAccountSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Close your account.
 *
 * Required: App Store guideline 5.1.1(v) says an app that lets people create an
 * account must let them delete it from inside the app. A support email does not
 * satisfy it.
 *
 * ## What actually happens, and why the copy says so
 *
 * Not a DELETE. `orders`, `bookings` and `refund_requests` reference profiles
 * with `on delete restrict`, and tax law requires those records be kept — so
 * the profile is emptied of everything identifying and the financial rows keep
 * pointing at a tombstone. The screen says this plainly rather than promising
 * an erasure that cannot happen, because discovering it later is far worse.
 *
 * ## Commitments first
 *
 * Before offering the button at all, this asks the database what is
 * outstanding. Someone with a session booked for next Tuesday sees that
 * session, not a refusal — the list IS the instruction. See
 * `account_deletion_blockers` in migration 0025.
 */
export function DeleteAccountSheet({ visible, onClose }: DeleteAccountSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {visible ? <DeleteAccountBody onClose={onClose} /> : null}
    </Modal>
  );
}

function DeleteAccountBody({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { refreshProfile } = useAuth();

  const blockers = useQuery({
    queryKey: qk.profiles.deletionBlockers,
    queryFn: accountDeletionBlockers,
  });

  const request = useMutation({
    mutationFn: requestAccountDeletion,
    onSuccess: async () => {
      await refreshProfile();
      void queryClient.invalidateQueries({ queryKey: qk.profiles.all });
    },
  });

  const rows = blockers.data ?? [];
  const canClose = rows.length === 0;

  if (request.isSuccess) {
    return (
      <View style={[styles.page, { paddingTop: spacing.lg }]}>
        <Text variant="h3" heading={1}>
          Your account is closing
        </Text>
        <Text variant="body" color="secondary">
          You are hidden from My Source Network from now on. Nothing is deleted
          yet — sign in again within 30 days and everything comes back exactly
          as it was.
        </Text>
        <Text variant="bodySmall" color="muted">
          After 30 days your name, photograph and contact details are erased for
          good. Records of anything you paid for or were paid for are kept, with
          your name removed, because we are required to keep them.
        </Text>
        <Button label="Done" onPress={onClose} style={styles.action} />
      </View>
    );
  }

  return (
    <>
      <View
        style={[
          styles.header,
          { paddingTop: spacing.md, borderBottomColor: theme.colors.border },
        ]}
      >
        <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} />
        <Text variant="bodyStrong">Close account</Text>
        {/* Keeps the title centred against the Cancel button. */}
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.page}>
        {blockers.isPending ? (
          <>
            <Skeleton height={72} radius="lg" />
            <Skeleton height={120} radius="lg" />
          </>
        ) : blockers.isError ? (
          <FormError error={blockers.error} />
        ) : canClose ? (
          <>
            <Text variant="h4" heading={1}>
              This is reversible for 30 days
            </Text>

            <Card variant="outlined" style={styles.card}>
              <Fact
                title="You disappear straight away"
                body="Your profile, services and events stop showing anywhere on My Source Network the moment you confirm."
              />
              <Fact
                title="You have 30 days to change your mind"
                body="Sign in again inside 30 days and everything is restored exactly as it was."
              />
              <Fact
                title="After that, your details are erased"
                body="Your name, photograph, contact details and location are removed permanently."
              />
              <Fact
                title="Payment records are kept"
                body="Anything you paid for or were paid for stays on record with your name removed. We are legally required to keep those."
                last
              />
            </Card>

            {request.isError ? <FormError error={request.error} /> : null}

            <Button
              label="Close my account"
              variant="danger"
              fullWidth
              loading={request.isPending}
              onPress={() => request.mutate()}
              accessibilityHint="Hides your account now and erases your details after 30 days"
            />
          </>
        ) : (
          <>
            <Text variant="h4" heading={1}>
              {rows.length === 1
                ? 'One thing first'
                : `${rows.length} things first`}
            </Text>
            <Text variant="body" color="secondary">
              Other people are counting on these. Cancel or finish them, then
              come back and your account will close.
            </Text>

            <Card variant="outlined" padding="sm">
              {rows.map((row, index) => (
                <View
                  key={`${row.kind}-${row.occurs_at}-${index}`}
                  style={[
                    styles.blocker,
                    index === rows.length - 1
                      ? undefined
                      : { borderBottomWidth: borderWidths.hairline, borderBottomColor: theme.colors.border },
                  ]}
                >
                  <Text variant="body">{row.detail}</Text>
                  <Text variant="bodySmall" color="muted">
                    {formatLocal(row.occurs_at)}
                  </Text>
                </View>
              ))}
            </Card>

            <Text variant="caption" color="muted">
              Cancelling a session may mean refunding it. Refunds are handled on
              the booking itself.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

function Fact({ title, body, last = false }: { title: string; body: string; last?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.fact,
        last
          ? undefined
          : { borderBottomWidth: borderWidths.hairline, borderBottomColor: theme.colors.border },
      ]}
    >
      <Text variant="bodyStrong">{title}</Text>
      <Text variant="bodySmall" color="secondary">
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_GUTTER,
    paddingBottom: spacing.sm,
    borderBottomWidth: borderWidths.hairline,
  },
  headerSpacer: { width: 64 },
  page: { padding: SCREEN_GUTTER, gap: spacing.md },
  card: { padding: 0 },
  fact: { padding: spacing.md, gap: spacing.xxs },
  blocker: { paddingVertical: spacing.sm, gap: spacing.xxs },
  action: { alignSelf: 'flex-start' },
});
