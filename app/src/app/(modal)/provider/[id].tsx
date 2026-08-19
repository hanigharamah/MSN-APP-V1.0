import type { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  AboutPanel,
  HostedEventListItem,
  ProfileHeader,
  ProfileTabs,
  ReviewListItem,
  ServiceListItem,
  type ProviderTabKey,
} from '@/components/providers';
import { EmptyState, ErrorState, Screen, Skeleton, SkeletonList, Text } from '@/components/ui';
import { signInThen } from '@/components/auth/sign-in-then';
import { ReportSheet, SafetyMenu } from '@/components/safety';
import { blockProfile, hasBlocked, unblockProfile } from '@/lib/queries/safety';
import { useAuth } from '@/context/AuthContext';
import { AppError, errorMessage } from '@/lib/errors';
import { listEventsHostedBy } from '@/lib/queries/events';
import { qk } from '@/lib/queries/keys';
import {
  startDirectConversation,
} from '@/lib/queries/messages';
import {
  followProfile,
  getProfile,
  getProfileSpecialities,
  getProviderDetails,
  getProviderRating,
  isFollowing,
  listReviewsForProfile,
  unfollowProfile,
} from '@/lib/queries/profiles';
import { listServicesByProvider } from '@/lib/queries/services';
import { SCREEN_GUTTER, spacing } from '@/theme';
import type { EventRow } from '@/types/database';

/**
 * The public practitioner profile.
 *
 * Four real tabs rather than the web app's scroll-spy anchors — see
 * DESIGN_SOURCE §6.3 and judgement call 16. Each tab's query is deferred until
 * the tab is first opened, which is the whole point of the divergence: the web
 * version mounts services, events, media and reviews simultaneously.
 *
 * `is_verified` and `is_certified` are platform-granted and silently reverted
 * by a trigger for non-admins, so they appear as badges and nothing here offers
 * to change them.
 */
export default function ProviderProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;
  const isSelf = viewerId !== null && viewerId === id;

  const [tab, setTab] = useState<ProviderTabKey>('services');
  // Which tabs have been opened. A tab's list query does not run until its tab
  // has been seen once, and stays mounted in the cache afterwards so going back
  // to it is instant.
  const [opened, setOpened] = useState<Record<ProviderTabKey, boolean>>({
    services: true,
    events: false,
    about: true,
    reviews: false,
  });

  const openTab = (next: ProviderTabKey) => {
    setTab(next);
    setOpened((current) => (current[next] ? current : { ...current, [next]: true }));
  };

  const profileQuery = useQuery({
    queryKey: qk.profiles.detail(id),
    queryFn: () => getProfile(id),
    enabled: Boolean(id),
  });

  const detailsQuery = useQuery({
    queryKey: qk.profiles.providerDetails(id),
    queryFn: () => getProviderDetails(id),
    enabled: Boolean(id),
  });

  const specialitiesQuery = useQuery({
    queryKey: qk.profiles.specialities(id),
    queryFn: () => getProfileSpecialities(id),
    enabled: Boolean(id),
  });

  const ratingQuery = useQuery({
    queryKey: qk.profiles.rating(id),
    queryFn: () => getProviderRating(id),
    enabled: Boolean(id),
  });

  const servicesQuery = useQuery({
    queryKey: qk.services.byProvider(id),
    queryFn: () => listServicesByProvider(id),
    enabled: Boolean(id) && opened.services,
  });

  const eventsQuery = useQuery({
    queryKey: qk.events.hosting(id),
    queryFn: () => listEventsHostedBy(id),
    enabled: Boolean(id) && opened.events,
  });

  const reviewsQuery = useQuery({
    queryKey: qk.profiles.reviews(id),
    queryFn: () => listReviewsForProfile(id),
    enabled: Boolean(id) && opened.reviews,
  });

  // Keyed under `profiles/following/<viewer>` so invalidating that prefix after
  // a follow refreshes both this flag and the viewer's following list.
  const followQuery = useQuery({
    queryKey: [...qk.profiles.following(viewerId ?? 'anonymous'), id] as const,
    queryFn: async () => (viewerId === null ? false : isFollowing(viewerId, id)),
    enabled: viewerId !== null && !isSelf,
  });

  const followMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (viewerId === null) {
        throw new AppError('auth', 'Sign in to follow practitioners.');
      }
      if (next) await followProfile(viewerId, id);
      else await unfollowProfile(viewerId, id);
      return next;
    },
    onSuccess: () => {
      if (viewerId === null) return;
      void queryClient.invalidateQueries({ queryKey: qk.profiles.following(viewerId) });
    },
  });

  // Blocking: only ever the viewer's own row, so this is safe to read as a
  // plain boolean. See `hasBlocked` for why it is one-directional.
  const blockedQuery = useQuery({
    queryKey: [...qk.profiles.detail(id), 'blocked-by-me'],
    queryFn: async () => (viewerId === null ? false : hasBlocked(viewerId, id)),
    enabled: viewerId !== null,
  });

  const blockMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (viewerId === null) throw new AppError('auth', 'Sign in to block someone.');
      if (next) await blockProfile(viewerId, id);
      else await unblockProfile(viewerId, id);
      return next;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.profiles.detail(id) });
      void queryClient.invalidateQueries({ queryKey: qk.conversations.all });
    },
  });

  /**
   * Message.
   *
   * One call. `start_direct_conversation` finds the existing thread or makes
   * one, refuses a block in either direction, and does it atomically — so the
   * reuse lookup, the block check and the two inserts that used to live here
   * are all gone. They also could not work: the participants policy only ever
   * let a client insert its OWN row, so creating a two-party thread from the
   * app failed every time.
   */
  const messageMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      if (viewerId === null) {
        throw new AppError('auth', 'Sign in to send a message.');
      }
      return startDirectConversation(id);
    },
    onSuccess: (conversationId) => {
      void queryClient.invalidateQueries({ queryKey: qk.conversations.all });
      router.push({ pathname: '/(modal)/conversation/[id]', params: { id: conversationId } });
    },
  });

  if (profileQuery.isPending) {
    return (
      <Screen scroll safeBottom>
        <Skeleton height={120} radius="lg" />
        <Skeleton width={120} height={120} radius="full" style={styles.pendingAvatar} />
        <Skeleton height={28} width="60%" style={styles.pendingLine} />
        <Skeleton height={16} width="40%" style={styles.pendingLine} />
        <SkeletonList count={3} itemHeight={96} />
      </Screen>
    );
  }

  if (profileQuery.isError) {
    return (
      <Screen>
        <ErrorState error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />
      </Screen>
    );
  }

  const profile = profileQuery.data;
  if (!profile) {
    return (
      <Screen>
        <EmptyState
          icon="person-outline"
          title="Profile not found"
          description="This account may have been removed or suspended."
          actionLabel="Find someone else"
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  const actionError = followMutation.error ?? messageMutation.error;
  const hostedEvents = visibleEvents(eventsQuery.data, isSelf);

  return (
    <>
      <Stack.Screen
        options={{
          title: profile.display_name,
          // Never on your own profile: reporting or blocking yourself is
          // nonsense, and an inert menu is worse than no menu.
          headerRight: isSelf
            ? undefined
            : () => (
                <SafetyMenu
                  personName={profile.display_name}
                  isBlocked={blockedQuery.data ?? false}
                  onReport={() => {
                    if (viewerId === null) {
                      signInThen(router, `/provider/${id}`);
                      return;
                    }
                    setReporting(true);
                  }}
                  onToggleBlock={() => {
                    if (viewerId === null) {
                      signInThen(router, `/provider/${id}`);
                      return;
                    }
                    blockMutation.mutate(!(blockedQuery.data ?? false));
                  }}
                />
              ),
        }}
      />

      <ReportSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        subject={{ kind: 'profile', id }}
        subjectLabel={profile.display_name}
      />

      <Screen edgeToEdge safeBottom>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <ProfileHeader
            profile={profile}
            rating={ratingQuery.data}
            isFollowing={isSelf ? false : (followQuery.data ?? null)}
            signedIn={viewerId !== null}
            followPending={followMutation.isPending}
            onToggleFollow={() => {
              if (viewerId === null) {
                signInThen(router, `/provider/${id}`);
                return;
              }
              followMutation.mutate(!(followQuery.data ?? false));
            }}
            messagePending={messageMutation.isPending}
            onMessage={() => {
              if (viewerId === null) {
                signInThen(router, `/provider/${id}`);
                return;
              }
              messageMutation.mutate();
            }}
            isSelf={isSelf}
          />

          {actionError ? (
            <Text
              variant="bodySmall"
              color="danger"
              style={styles.actionError}
              accessibilityLiveRegion="polite"
            >
              {errorMessage(actionError)}
            </Text>
          ) : null}

          <View style={styles.tabs}>
            <ProfileTabs
              active={tab}
              onChange={openTab}
              counts={{
                services: servicesQuery.data?.length,
                events: eventsQuery.data?.length,
                reviews: ratingQuery.data?.total,
              }}
            />
          </View>

          <View style={styles.panel}>
            {tab === 'services' ? (
              <TabPanel
                isPending={servicesQuery.isPending}
                isError={servicesQuery.isError}
                error={servicesQuery.error}
                onRetry={() => void servicesQuery.refetch()}
                isEmpty={(servicesQuery.data?.length ?? 0) === 0}
                emptyIcon="leaf-outline"
                emptyTitle="No services yet"
                emptyDescription={
                  isSelf
                    ? 'You have not published any one-to-one sessions yet.'
                    : `${profile.display_name} has not published any one-to-one sessions. You can still ask them what they offer.`
                }
                emptyActionLabel={isSelf ? undefined : `Message ${profile.display_name.split(' ')[0]}`}
                onEmptyAction={isSelf ? undefined : () => messageMutation.mutate()}
              >
                <View style={styles.list}>
                  {servicesQuery.data?.map((service) => (
                    <ServiceListItem
                      key={service.id}
                      service={service}
                      onPress={() => router.push({ pathname: '/(modal)/service/[id]', params: { id: service.id } })}
                    />
                  ))}
                </View>
              </TabPanel>
            ) : null}

            {tab === 'events' ? (
              <TabPanel
                isPending={eventsQuery.isPending}
                isError={eventsQuery.isError}
                error={eventsQuery.error}
                onRetry={() => void eventsQuery.refetch()}
                isEmpty={hostedEvents.length === 0}
                emptyIcon="calendar-outline"
                emptyTitle="No events"
                emptyDescription={`${profile.display_name} is not hosting anything right now. Following them means you hear when that changes.`}
                emptyActionLabel={isSelf || followQuery.data ? undefined : 'Follow'}
                onEmptyAction={
                  isSelf || followQuery.data ? undefined : () => followMutation.mutate(true)
                }
              >
                <View style={styles.list}>
                  {hostedEvents.map((event) => (
                    <HostedEventListItem
                      key={event.id}
                      event={event}
                      showStatus={isSelf}
                      onPress={() => router.push({ pathname: '/(modal)/event/[id]', params: { id: event.id } })}
                    />
                  ))}
                </View>
              </TabPanel>
            ) : null}

            {tab === 'about' ? (
              <TabPanel
                isPending={detailsQuery.isPending || specialitiesQuery.isPending}
                isError={detailsQuery.isError || specialitiesQuery.isError}
                error={detailsQuery.error ?? specialitiesQuery.error}
                onRetry={() => {
                  void detailsQuery.refetch();
                  void specialitiesQuery.refetch();
                }}
                isEmpty={false}
                emptyIcon="information-circle-outline"
                emptyTitle="Nothing here yet"
              >
                <AboutPanel
                  profile={profile}
                  details={detailsQuery.data ?? null}
                  specialities={specialitiesQuery.data ?? []}
                />
              </TabPanel>
            ) : null}

            {tab === 'reviews' ? (
              <TabPanel
                isPending={reviewsQuery.isPending}
                isError={reviewsQuery.isError}
                error={reviewsQuery.error}
                onRetry={() => void reviewsQuery.refetch()}
                isEmpty={(reviewsQuery.data?.length ?? 0) === 0}
                emptyIcon="chatbubble-ellipses-outline"
                emptyTitle="No reviews yet"
                emptyDescription="Reviews appear here after a completed booking or order."
              >
                <View style={styles.list}>
                  {reviewsQuery.data?.map((review) => (
                    <ReviewListItem key={review.id} review={review} />
                  ))}
                </View>
              </TabPanel>
            ) : null}
          </View>
        </ScrollView>
      </Screen>
    </>
  );
}

/**
 * A public viewer only sees published events. `listEventsHostedBy` returns
 * every status the caller's RLS lets through, which for your own profile is all
 * of them — hence the `isSelf` escape.
 */
function visibleEvents(
  events: readonly EventRow[] | undefined,
  isSelf: boolean,
): readonly EventRow[] {
  if (!events) return [];
  return isSelf ? events : events.filter((event) => event.status === 'published');
}

interface TabPanelProps {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  isEmpty: boolean;
  emptyIcon: keyof typeof Ionicons.glyphMap;
  emptyTitle: string;
  emptyDescription?: string;
  /**
   * The way out of an empty tab. A practitioner with nothing published is the
   * one case where a seeker is already interested and has nothing to tap —
   * so the tab offers to message them instead of just reporting the absence.
   */
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  children: ReactNode;
}

/** The four mandatory branches, once, so each tab does not restate them. */
function TabPanel({
  isPending,
  isError,
  error,
  onRetry,
  isEmpty,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  children,
}: TabPanelProps) {
  if (isPending) return <SkeletonList count={3} itemHeight={96} />;
  if (isError) return <ErrorState error={error} onRetry={onRetry} />;
  if (isEmpty) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    paddingBottom: spacing.xxl,
  },
  pendingAvatar: {
    marginTop: -75,
    marginLeft: SCREEN_GUTTER,
  },
  pendingLine: {
    marginTop: spacing.xs,
    marginHorizontal: SCREEN_GUTTER,
  },
  actionError: {
    marginTop: spacing.xs,
    paddingHorizontal: SCREEN_GUTTER,
  },
  tabs: {
    marginTop: spacing.lg,
  },
  panel: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.md,
  },
  list: {
    gap: spacing.sm,
  },
});
