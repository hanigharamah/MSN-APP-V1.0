import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  AccountHeader,
  ActivityPanel,
  Consequences,
  DecisionPanel,
  VerificationEvidencePanel,
  adminKeys,
  confirmAction,
  confirmDestructive,
  getAccountActivity,
  getVerificationEvidence,
  setAccountCertified,
  setAccountSuspended,
  setAccountVerified,
} from '@/components/admin-people';
import { InlineError } from '@/components/events';
import { EmptyState, ErrorState, Screen, Skeleton, SkeletonList, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { qk } from '@/lib/queries/keys';
import { getProfile } from '@/lib/queries/profiles';
import { spacing } from '@/theme';
import { isProviderAccount } from '@/types/database';

/**
 * One account, and the three decisions an operator can make about it.
 *
 * ## Why verification gets a whole panel of evidence
 *
 * The Verified badge is the trust signal the marketplace leans on — a seeker
 * scanning Discover uses it to decide who to be alone in a room with — and
 * until this screen existed **nobody could grant it**. There was no UI, and
 * `guard_profile_trust_flags` reverts the column for everyone who is not an
 * admin, so the flag has sat at its default on every account since launch.
 *
 * That makes the design of this screen consequential rather than cosmetic. A
 * switch labelled "Verified" would make the badge mean "an operator saw a row".
 * So the evidence comes first, the control names the verb, and the
 * confirmation restates what the badge will do.
 *
 * ## Why there are no switches anywhere on this screen
 *
 * A `Switch` says "preference, flip it back if you like". None of these are.
 * Suspension in particular is a person's livelihood going dark, and it has a
 * consequence the database does not clean up after — see the panel copy.
 *
 * ## What this screen deliberately cannot do
 *
 * Change `account_type`. Admins can (the trigger exempts them), but turning a
 * seeker into a practitioner is a different kind of decision from the three
 * here and it silently changes which RLS policies apply to their rows.
 * TODO(agent · admin): if operators need it, it belongs behind its own
 * confirmation with its own evidence, not folded in beside the badges.
 */
export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { profile: me } = useAuth();

  const account = useQuery({
    queryKey: qk.profiles.detail(id),
    queryFn: () => getProfile(id),
    enabled: Boolean(id),
  });

  const activity = useQuery({
    queryKey: adminKeys.people.activity(id),
    queryFn: () => getAccountActivity(id),
    enabled: Boolean(id),
  });

  const evidence = useQuery({
    queryKey: adminKeys.people.evidence(id),
    queryFn: () => getVerificationEvidence(id),
    enabled: Boolean(id),
  });

  /**
   * Every decision invalidates the whole `profiles` prefix rather than just
   * this row. A suspension changes what Discover, the provider profile and the
   * search results are allowed to return, and those are all cached under
   * `qk.profiles.*`.
   */
  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: qk.profiles.all });
  };

  const verify = useMutation({
    mutationFn: (next: boolean) => setAccountVerified(id, next),
    onSuccess: settle,
  });
  const certify = useMutation({
    mutationFn: (next: boolean) => setAccountCertified(id, next),
    onSuccess: settle,
  });
  const suspend = useMutation({
    mutationFn: (next: boolean) => setAccountSuspended(id, next),
    onSuccess: settle,
  });

  if (account.isPending) {
    return (
      <Screen safeBottom>
        <Stack.Screen options={{ title: 'Account' }} />
        <View style={styles.page} accessibilityLiveRegion="polite" accessibilityLabel="Loading account">
          <Skeleton height={180} radius="lg" />
          <SkeletonList count={3} itemHeight={140} />
        </View>
      </Screen>
    );
  }

  if (account.isError) {
    return (
      <Screen safeBottom>
        <Stack.Screen options={{ title: 'Account' }} />
        <ErrorState error={account.error} onRetry={() => void account.refetch()} />
      </Screen>
    );
  }

  if (!account.data) {
    return (
      <Screen safeBottom>
        <Stack.Screen options={{ title: 'Account' }} />
        <EmptyState
          icon="person-outline"
          title="No such account"
          description="This account has been deleted, or the link is wrong. Nothing here to decide."
        />
      </Screen>
    );
  }

  const profile = account.data;
  const isSelf = me?.id === profile.id;
  const upcoming = activity.data?.upcomingBookings ?? null;
  const mutationError = verify.error ?? certify.error ?? suspend.error;

  // Every control is refused on your own account. Not because the database
  // would stop you — it would not — but because un-verifying or suspending
  // yourself from a phone is a mistake with no undo path from inside the app.
  const selfReason = 'This is your own account. Another admin has to make this call.';

  return (
    <Screen scroll safeBottom>
      <Stack.Screen options={{ title: profile.display_name }} />

      <View style={styles.page}>
        <AccountHeader profile={profile} />

        {activity.isPending ? (
          <Skeleton height={160} radius="lg" />
        ) : activity.isError ? (
          <InlineError error={activity.error} onRetry={() => void activity.refetch()} />
        ) : (
          <ActivityPanel activity={activity.data} accountType={profile.account_type} />
        )}

        <Text variant="h3" heading={2} style={styles.sectionTitle}>
          Decisions
        </Text>

        {mutationError ? <InlineError error={mutationError} /> : null}

        {/* --- Verification ------------------------------------------------
            The evidence panel needs the completed-session count from Activity
            as well as the listings and reviews, so it waits on both. A failure
            in either leaves the decision below still usable — an operator must
            be able to suspend someone whether or not their reviews loaded. */}
        {evidence.isPending || activity.isPending ? (
          <Skeleton height={200} radius="lg" />
        ) : evidence.isError ? (
          <InlineError error={evidence.error} onRetry={() => void evidence.refetch()} />
        ) : activity.data ? (
          <VerificationEvidencePanel evidence={evidence.data} activity={activity.data} />
        ) : null}

        <DecisionPanel
          title="Verification"
          state={profile.is_verified ? 'Verified' : 'Not verified'}
          stateTone={profile.is_verified ? 'success' : 'neutral'}
          explanation={verificationExplanation(profile.is_verified, isProviderAccount(profile.account_type))}
          consequences={
            profile.is_verified
              ? [
                  'The badge disappears from their profile and from every card in Discover, straight away.',
                  'Seekers who filtered by "verified only" stop seeing them.',
                  'Nobody who already booked them is told anything.',
                ]
              : [
                  'The Verified badge appears on their profile and on their cards in Discover.',
                  'They start appearing for seekers who filter by "verified only".',
                  'You are the person who vouched for them. There is no record of why.',
                ]
          }
          consequenceTone={profile.is_verified ? 'caution' : 'neutral'}
          actionLabel={profile.is_verified ? 'Remove verification' : 'Verify this account'}
          actionVariant={profile.is_verified ? 'danger' : 'primary'}
          actionHint={
            profile.is_verified
              ? 'Removes the Verified badge from their profile everywhere in the app'
              : 'Grants the Verified badge, which seekers use to decide who to trust'
          }
          loading={verify.isPending}
          disabled={isSelf}
          disabledReason={isSelf ? selfReason : undefined}
          onAction={() => {
            if (profile.is_verified) {
              confirmDestructive({
                title: 'Remove verification?',
                message: `${profile.display_name} loses the Verified badge everywhere in the app, immediately. Anyone who booked them because of it is not told.`,
                confirmLabel: 'Remove verification',
                onConfirm: () => verify.mutate(false),
              });
            } else {
              confirmAction({
                title: 'Verify this account?',
                message: `${profile.display_name} gets the Verified badge on their profile and on every card in Discover. Seekers use it to decide who to trust.`,
                confirmLabel: 'Verify',
                onConfirm: () => verify.mutate(true),
              });
            }
          }}
        />

        {/* --- Certification ----------------------------------------------- */}
        <DecisionPanel
          title="Certification"
          state={profile.is_certified ? 'Certified' : 'Not certified'}
          stateTone={profile.is_certified ? 'accent' : 'neutral'}
          explanation={
            'A second admin-only badge, shown beside Verified on their profile and cards. ' +
            'The schema does not say what it attests to and nothing in the app explains it to a seeker — ' +
            'agree what it means with the team before granting it.'
          }
          consequences={
            profile.is_certified
              ? ['The Certified badge disappears from their profile and cards, straight away.']
              : ['The Certified badge appears beside Verified on their profile and cards.']
          }
          actionLabel={profile.is_certified ? 'Remove certification' : 'Certify this account'}
          actionVariant={profile.is_certified ? 'danger' : 'secondary'}
          actionHint={
            profile.is_certified
              ? 'Removes the Certified badge from their profile'
              : 'Adds the Certified badge to their profile'
          }
          loading={certify.isPending}
          disabled={isSelf}
          disabledReason={isSelf ? selfReason : undefined}
          onAction={() => {
            if (profile.is_certified) {
              confirmDestructive({
                title: 'Remove certification?',
                message: `${profile.display_name} loses the Certified badge on their profile and cards.`,
                confirmLabel: 'Remove',
                onConfirm: () => certify.mutate(false),
              });
            } else {
              confirmAction({
                title: 'Certify this account?',
                message: `${profile.display_name} gets the Certified badge beside Verified on their profile.`,
                confirmLabel: 'Certify',
                onConfirm: () => certify.mutate(true),
              });
            }
          }}
        />

        {/* --- Suspension --------------------------------------------------- */}
        <DecisionPanel
          title="Suspension"
          state={profile.is_suspended ? 'Suspended' : 'Active'}
          stateTone={profile.is_suspended ? 'danger' : 'success'}
          explanation={
            profile.is_suspended
              ? 'This account is hidden from the marketplace. Nobody but them and other admins can see their profile, events or services.'
              : 'Suspending hides the whole account from the marketplace. It does not undo anything the account has already done.'
          }
          consequences={
            profile.is_suspended
              ? ['Their profile, events and services become findable again, immediately.']
              : suspensionConsequences(upcoming, profile.is_admin)
          }
          consequenceTone={profile.is_suspended ? 'neutral' : 'caution'}
          actionLabel={profile.is_suspended ? 'Lift suspension' : 'Suspend account'}
          actionVariant={profile.is_suspended ? 'secondary' : 'danger'}
          actionHint={
            profile.is_suspended
              ? 'Makes their profile, events and services visible to everyone again'
              : 'Hides them from the marketplace. Does not cancel their bookings or refund anyone.'
          }
          loading={suspend.isPending}
          disabled={isSelf}
          disabledReason={isSelf ? selfReason : undefined}
          onAction={() => {
            if (profile.is_suspended) {
              confirmAction({
                title: 'Lift the suspension?',
                message: `${profile.display_name} becomes visible across the marketplace again straight away.`,
                confirmLabel: 'Lift suspension',
                onConfirm: () => suspend.mutate(false),
              });
            } else {
              confirmDestructive({
                title: 'Suspend this account?',
                message: suspensionConfirmMessage(profile.display_name, upcoming),
                confirmLabel: 'Suspend account',
                onConfirm: () => suspend.mutate(true),
              });
            }
          }}
        />

        <Consequences
          title="Not available from this screen"
          items={[
            'Cancelling their bookings. Each one has its own refund position and has to be handled from the booking.',
            'Refunding money already taken. Refunds are decided in the refunds queue.',
            'Changing their account type, or their admin access.',
            'Deleting the account.',
          ]}
        />
      </View>
    </Screen>
  );
}

function verificationExplanation(isVerified: boolean, isProvider: boolean): string {
  const base = isVerified
    ? 'This account carries the Verified badge — the signal seekers use when deciding who to trust.'
    : 'Verified is the trust signal the marketplace runs on. Grant it from what is below, not from the name.';

  if (isProvider) return base;
  return `${base} This is a seeker account, so the badge only shows on their own profile — seekers do not appear in Discover.`;
}

/**
 * The suspension warning, with the number that makes it real.
 *
 * `profiles are publicly readable` is `using (not is_suspended or …)`, so the
 * flag alone removes the account from the marketplace. Nothing else moves:
 * `bookings` has no suspension-aware policy, no trigger cancels them, and
 * `available_slots` still treats a confirmed booking as busy time. So a
 * suspended practitioner keeps a calendar full of sessions that they can still
 * see, that the seeker can still see, and that nobody will show up to unless
 * someone cancels them by hand.
 *
 * That is the single most likely mistake this screen can prevent, so the count
 * is fetched and printed rather than described in the abstract.
 */
function suspensionConsequences(upcoming: number | null, isAdmin: boolean): string[] {
  const items = [
    'Their profile, events and services stop being visible to everyone except them and other admins.',
    'They can still sign in and see their own account. This is not a ban and it does not sign them out.',
  ];

  if (upcoming === null) {
    items.push(
      'Existing bookings are NOT cancelled. Confirmed sessions stay on both calendars and still block that time.',
    );
  } else if (upcoming > 0) {
    items.push(
      `${upcoming} upcoming ${upcoming === 1 ? 'booking is' : 'bookings are'} NOT cancelled. They stay on both calendars, still block that time, and the other party is not told. Cancel them from the booking if that is what you mean to do.`,
    );
  } else {
    items.push('They have no upcoming bookings, so nothing is left stranded on a calendar.');
  }

  items.push('Money already taken is not refunded. A refund is a separate decision.');

  if (isAdmin) {
    items.push('This account is an admin. Suspending it does not remove their admin access.');
  }
  return items;
}

function suspensionConfirmMessage(name: string, upcoming: number | null): string {
  const stranded =
    upcoming === null
      ? 'Their existing bookings are not cancelled and still block their calendar.'
      : upcoming > 0
        ? `Their ${upcoming} upcoming ${upcoming === 1 ? 'booking is' : 'bookings are'} not cancelled and still block their calendar.`
        : 'They have no upcoming bookings.';

  return `${name} disappears from the marketplace immediately. ${stranded} Nobody is refunded and nobody is told.`;
}

const styles = StyleSheet.create({
  page: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    marginTop: spacing.xs,
  },
});
