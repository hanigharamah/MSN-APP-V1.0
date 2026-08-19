import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, RefreshControl, StyleSheet, View } from 'react-native';

import {
  DeleteAccountSheet,
  EditProfileSheet,
  ModeHintBubble,
  ProfileHeader,
  SettingsRow,
  accountTypeLabel,
} from '@/components/profile';
import { BookingStatusSection } from '@/components/provider-tools/availability';
import { FormError } from '@/components/auth/FormError';
import { Button, Card, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { SignedOut } from '@/components/auth/SignedOut';
import { useAuth } from '@/context/AuthContext';
import { useMode } from '@/context/ModeContext';
import { toAppError } from '@/lib/errors';
import { formatLocal } from '@/lib/format';
import { qk } from '@/lib/queries/keys';
import { becomePractitioner } from '@/lib/queries/profiles';
import { cancelAccountDeletion } from '@/lib/queries/safety';
import { spacing } from '@/theme';
import { isProviderAccount } from '@/types/database';


/**
 * Profile — the signed-in user's own account.
 *
 * ## The rule this screen exists to respect
 *
 * `is_verified`, `is_certified`, `is_admin`, `is_suspended` and `account_type`
 * are reverted by a database trigger for everyone who is not an admin. The
 * write succeeds and changes nothing. So they appear here as badges and as a
 * read-only "Account" card, never as a control — and the card says in words
 * that My Source Network sets them. An input for a value the database will
 * silently discard is worse than no input at all.
 *
 * There is no balance, no credits and no token UI anywhere on this screen. The
 * token system was rejected; `formatTokens` still exists in `lib/format.ts` but
 * nothing should call it.
 */
/**
 * The grace period, mirrored from `finalise_account_deletion` (migration 0025)
 * for display only. The database owns the real deadline — if the two ever
 * disagree the database wins, and this is the one to change.
 */
const DELETION_GRACE_DAYS = 30;

function deletionDeadline(requestedAt: string): string {
  const deadline = new Date(requestedAt);
  deadline.setDate(deadline.getDate() + DELETION_GRACE_DAYS);
  return deadline.toISOString();
}

export default function ProfileScreen() {
  const router = useRouter();
  // Still needed by sign out, which clears every cached query on the way out.
  const queryClient = useQueryClient();
  const { session, profile, profileLoading, profileError, signOut, refreshProfile } = useAuth();

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { mode, toggle, setMode } = useMode();

  const becomeProvider = useMutation({
    mutationFn: becomePractitioner,
    onSuccess: async () => {
      // The header, the practice section and the mode switch all read from
      // AuthContext's profile, so it has to be refetched before any of them
      // change — otherwise the button succeeds and the screen looks identical.
      await refreshProfile();
      void queryClient.invalidateQueries({ queryKey: qk.profiles.all });
    },
  });

  const restore = useMutation({
    mutationFn: cancelAccountDeletion,
    onSuccess: () => void refreshProfile(),
  });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<unknown>(null);


  // Notifications moved to their own screen behind the header bell. Everything
  // that read, marked and routed them went with it — see
  // `src/app/notifications.tsx` and `NotificationBell`.


  // ---------------------------------------------------------------------------
  // Sign out
  // ---------------------------------------------------------------------------
  const handleSignOut = useCallback(() => {
    Alert.alert('Sign out', 'You will need to sign in again to see your bookings and messages.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          setSignOutError(null);
          setSigningOut(true);
          void signOut()
            .then(() => {
              // Nothing cached belongs to the next person to use this device.
              queryClient.clear();
              // The root guard redirects as soon as the session clears.
            })
            .catch((caught: unknown) => {
              setSignOutError(toAppError(caught, 'sign out'));
              setSigningOut(false);
            });
        },
      },
    ]);
  }, [queryClient, signOut]);

  // ---------------------------------------------------------------------------
  // Branches
  // ---------------------------------------------------------------------------
  // Both branches are gated on there being no profile to show, not on the
  // fetch being in flight.
  //
  // `profileLoading` goes true on every refresh — including pull-to-refresh and
  // the refetch after saving an edit — so branching on it tore the whole screen
  // down and replaced it with a skeleton mid-gesture, taking the
  // `RefreshControl` the user was still holding with it. And a refresh that
  // fails should not take a profile we already have off the screen: the stale
  // copy plus a failed refresh is strictly more useful than an error card.
  // Signed out. Distinct from "signed in but the profile failed to load",
  // which is the branch below and is an error, not a state.
  if (!session) {
    return (
      <SignedOut
        screenTitle="Profile"
        headline="Log in to book and message"
        description="Your bookings, tickets and conversations with practitioners all live behind your account."
        actionLabel="Log in or sign up"
      >
        <Card variant="outlined" padding="sm">
          <SettingsRow
            icon="help-circle-outline"
            label="Get help"
            onPress={() => {
              void Linking.openURL(
                'mailto:support@mysourcenetwork.com?subject=' +
                  encodeURIComponent('Help with My Source Network'),
              );
            }}
            last
          />
        </Card>
      </SignedOut>
    );
  }

  if (!profile) {
    if (profileError) {
      return (
        <Screen>
          <ErrorState error={profileError} onRetry={() => void refreshProfile()} />
          {signOutError ? <FormError error={signOutError} /> : null}
          {/* An expired session maps to `auth`, which is not retryable, so
              `ErrorState` shows no button — without this the screen is a dead
              end with no way back to sign in. */}
          <Button
            label="Sign out"
            variant="ghost"
            onPress={handleSignOut}
            loading={signingOut}
            fullWidth
            accessibilityHint="Signs you out of My Source Network on this device."
          />
        </Screen>
      );
    }

    return (
      <Screen>
        <View accessibilityLiveRegion="polite" accessibilityLabel="Loading your profile">
          <View style={styles.headerSkeleton}>
            <Skeleton width={80} height={80} radius="full" />
            <View style={styles.headerSkeletonText}>
              <Skeleton width="70%" height={20} />
              <Skeleton width="45%" height={14} />
              <Skeleton width="35%" height={14} />
            </View>
          </View>
        </View>
      </Screen>
    );
  }

  const isProvider = isProviderAccount(profile.account_type);

  /**
   * A join date wants no clock, and `lib/format.ts` has no date-only formatter
   * for the viewer's zone — `formatEventDate` is for an offering's own zone and
   * using it here would be the exact mix-up §8 of CONVENTIONS warns about. So
   * this takes the date half of `formatLocal`, which is `'d MMM yyyy, h:mm a'`.
   * The fallback covers the pattern changing under us rather than crashing.
   * TODO(agent · format): add `formatLocalDate` and delete this.
   */
  const memberSince = formatLocal(profile.created_at).split(', ')[0] ?? '';


  return (
    <View style={styles.root}>
      <Screen
        scroll
        refreshControl={
          <RefreshControl
            refreshing={profileLoading}
            onRefresh={() => {
              void refreshProfile();
            }}
          />
        }
      >
      {profile.deletion_requested_at ? (
        <Card variant="outlined" style={styles.card}>
          <Text variant="bodyStrong">Your account is closing</Text>
          <Text variant="bodySmall" color="secondary" style={styles.cardBody}>
            {`You are hidden from My Source Network. Everything comes back if you restore it before ${formatLocal(deletionDeadline(profile.deletion_requested_at))}.`}
          </Text>
          <Button
            label="Restore my account"
            variant="secondary"
            loading={restore.isPending}
            onPress={() => restore.mutate()}
            style={styles.cardAction}
          />
        </Card>
      ) : null}

      <ProfileHeader profile={profile} />

      {/* A refresh that failed over a profile we already have. Said inline
          rather than as a full-screen error, because the profile below is real
          — it is just not necessarily current. */}
      {profileError ? <FormError error={profileError} /> : null}

      {/* "My bookings" was a second button here, next to Edit profile. Bookings
          is already a tab one thumb away — two routes to the same screen makes
          neither feel like the real one, and it cost this row half its width
          for nothing. Edit profile is the only thing that belongs here, because
          it is the only thing that acts on the header above it. */}
      <View style={styles.actions}>
        <Button label="Edit profile" variant="secondary" onPress={() => setEditing(true)} />
      </View>

      {/* The "your profile is 0% complete" card used to sit here. It graded a
          paying customer the first time they opened the app, and its copy — "a
          fuller profile gets more enquiries" — was written for practitioners
          and shown to everyone. Nobody browsing a wellness marketplace is
          there to score well. Editing is one tap above; that is enough. */}


      {/* Notifications used to sit here. They now live behind the bell in the
          header, reachable from every tab — see `NotificationBell`. Identity
          and "what happened since I last looked" are different jobs, and the
          second was undiscoverable filed inside the first. */}

      {/* --- Become a practitioner --------------------------------------- */}
      {/* The door that used to be locked. `account_type` is set once at signup
          and `guard_profile_trust_flags` reverts any change to it, so someone
          who joined to book a sound bath and later wanted to run one had to
          abandon their account. Airbnb never asks the question at signup at
          all — everyone travels, and hosting appears when you have something to
          offer. This is that, after the fact. */}
      {!isProvider ? (
        <>
          <Text variant="h4" heading={2} style={styles.sectionTitle}>
            Offer your own sessions
          </Text>
          <Card variant="outlined" style={styles.card}>
            <Text variant="bodySmall" color="secondary" style={styles.cardBody}>
              Run events, take one-to-one bookings and publish your availability.
              You keep this account and everything in it — booking stays exactly
              as it is.
            </Text>
            {becomeProvider.isError ? <FormError error={becomeProvider.error} /> : null}
            <Button
              label="Start offering sessions"
              variant="secondary"
              loading={becomeProvider.isPending}
              onPress={() => becomeProvider.mutate()}
              style={styles.cardAction}
            />
          </Card>
        </>
      ) : null}

      {/* --- Provider tools --------------------------------------------- */}
      {isProvider ? (
        <>
          <View style={styles.sectionHeader}>
            <Text variant="h4" heading={2}>
              Your practice
            </Text>
            {/* Airbnb's "Switch to hosting", in the place a practitioner
                already comes to find their tools. Mode is presentation only —
                it changes which half of the app you see first, never what you
                are allowed to do. */}
            <Button
              label={mode === 'hosting' ? 'Switch to seeking' : 'Switch to hosting'}
              variant="ghost"
              size="sm"
              onPress={toggle}
              accessibilityHint={
                mode === 'hosting'
                  ? 'Shows your own bookings and tickets first'
                  : 'Shows the sessions people have booked with you first'
              }
            />
          </View>
          <Card variant="outlined" padding="sm">
            {/* Services, events and availability used to be three rows here.
                They are one destination now — the Listings tab, which appears
                in place of Discover while hosting. See docs/spec-listings.md.

                This row is the way in for someone who is in seeking mode and
                does not have that tab on screen. It switches them rather than
                deep-linking, because landing on a tab that is not in the bar
                you are looking at is disorienting. */}
            <SettingsRow
              icon="sparkles-outline"
              label="Listings"
              onPress={() => {
                if (mode !== 'hosting') setMode('hosting');
                router.push('/(tabs)/listings');
              }}
            />
            {/* Payouts needs Stripe Connect onboarding, which is not built yet.
                Left disabled rather than routed to an empty screen — a dead end
                you can see is better than one you walk into. */}
            <SettingsRow icon="card-outline" label="Payouts" badge="Soon" disabled last />
          </Card>

          {/* Whether you are taking bookings at all describes the PERSON, not
              any one listing — switching it off stops every session being
              offered. It used to live at the top of the Availability screen,
              which is now a section inside each service; leaving it there
              would have put a practitioner-wide switch inside one listing,
              where turning it off looks like it only affects that one. */}
          <View style={styles.bookingStatus}>
            <BookingStatusSection providerId={profile.id} />
          </View>
        </>
      ) : null}

      {/* --- Admin --------------------------------------------------------- */}
      {/* Admin had NO entry point anywhere in the app — the screens existed and
          were reachable only by deep link, which means in practice they did not
          exist. Placed above Account and below the practitioner tools: an
          operator opens this many times a day, so it should not be at the
          bottom of a scroll, but it must not sit above the things every user
          needs either. */}
      {profile.is_admin ? (
        <>
          <Text variant="h4" heading={2} style={styles.sectionTitle}>
            Operations
          </Text>
          <Card variant="outlined" padding="sm">
            <SettingsRow
              icon="shield-checkmark-outline"
              label="Admin"
              onPress={() => router.push('/(admin)' as never)}
              last
            />
          </Card>
        </>
      ) : null}

      {/* --- Account (read-only) ----------------------------------------- */}
      <Text variant="h4" heading={2} style={styles.sectionTitle}>
        Account
      </Text>
      <Card variant="outlined" padding="sm">
        <SettingsRow
          icon="person-outline"
          label="Account type"
          value={accountTypeLabel(profile.account_type)}
        />
        {/* Only for practitioners. These badges are a signal to SEEKERS about
            who they are booking — a seeker cannot earn either, does not want
            either, and was being told twice that they are "Not verified" and
            "Not certified": the product telling a paying customer they do not
            measure up, about credentials that were never on offer to them. */}
        {isProvider ? (
          <>
            <SettingsRow
              icon="shield-checkmark-outline"
              label="Verification"
              value={profile.is_verified ? 'Verified' : 'Not verified'}
            />
            <SettingsRow
              icon="ribbon-outline"
              label="Certification"
              value={profile.is_certified ? 'Certified' : 'Not certified'}
            />
          </>
        ) : null}
        <SettingsRow icon="calendar-clear-outline" label="Member since" value={memberSince} last />
        <Text variant="caption" color="muted" style={styles.readOnlyNote}>
          These are set by My Source Network and cannot be changed from the app.
        </Text>
      </Card>

      {/* --- Settings ----------------------------------------------------- */}
      <Text variant="h4" heading={2} style={styles.sectionTitle}>
        Settings
      </Text>
      <Card variant="outlined" padding="sm">
        {/* TODO(agent · notifications): push is not registered anywhere yet.
            `registerPushToken` exists but nothing calls it — that needs a hook
            that asks permission, reads the Expo push token, sets the Android
            channel and routes taps through `notifications.deep_link`. Until it
            does, saying "In-app only" is the truth. */}
        <SettingsRow icon="notifications-outline" label="Push notifications" value="In-app only" />
        <SettingsRow icon="color-palette-outline" label="Appearance" value="Follows device" />
        {/* Blocked accounts and Privacy were here as greyed "Soon" rows. A
            visible dead end reads as an unfinished app, and neither is
            something a person goes looking for — they will be added when they
            work. Help and support is the exception: see below. */}
        {/* Made to work rather than left greyed. Help is the one row a stuck
            person reaches for, and a disabled one tells them they are on their
            own. It opens their own mail app with the address pre-filled — the
            app sends nothing itself; the person writes and sends it.
            `support@mysourcenetwork.com` follows the address the web app's own
            welcome email gives out (emails/pre_signup/welcome.blade.php). */}
        <SettingsRow
          icon="ban-outline"
          label="Blocked accounts"
          onPress={() => router.push('/blocked')}
        />
        <SettingsRow
          icon="trash-outline"
          label="Close my account"
          onPress={() => setDeleting(true)}
        />
        <SettingsRow
          icon="help-circle-outline"
          label="Help and support"
          onPress={() => {
            void Linking.openURL(
              'mailto:support@mysourcenetwork.com?subject=' +
                encodeURIComponent('Help with My Source Network'),
            );
          }}
          last
        />
      </Card>

      {signOutError ? <ErrorState error={signOutError} style={styles.inlineState} /> : null}

      <Button
        label="Sign out"
        variant="ghost"
        onPress={handleSignOut}
        loading={signingOut}
        fullWidth
        style={styles.signOut}
        accessibilityHint="Signs you out of My Source Network on this device."
      />

      <EditProfileSheet
        profile={profile}
        visible={editing}
        onClose={() => setEditing(false)}
      />

      <DeleteAccountSheet visible={deleting} onClose={() => setDeleting(false)} />
      </Screen>

      {/* Sits outside `Screen` on purpose: inside it, the bubble would be
          content in a ScrollView and would scroll away from the tab it is
          pointing at. */}
      <ModeHintBubble />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bookingStatus: {
    marginTop: spacing.md,
  },
  headerSkeleton: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  headerSkeletonText: {
    flex: 1,
    gap: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  card: {
    marginTop: spacing.md,
  },
  cardBody: {
    marginTop: spacing.xxs,
  },
  cardAction: {
    marginTop: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  notificationsLoading: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  emptyNotifications: {
    paddingVertical: spacing.sm,
  },
  inlineState: {
    paddingVertical: spacing.lg,
  },
  more: {
    paddingTop: spacing.xs,
  },
  readOnlyNote: {
    paddingTop: spacing.xs,
  },
  signOut: {
    marginTop: spacing.lg,
  },
});
