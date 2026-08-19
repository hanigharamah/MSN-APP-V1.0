import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BookingCard, Segmented, TicketCard, type SegmentedOption } from '@/components/bookings';
import { Button, EmptyState, ErrorState, Screen, SkeletonList, Text } from '@/components/ui';
import { SignedOut } from '@/components/auth/SignedOut';
import { useAuth } from '@/context/AuthContext';
import { useMode } from '@/context/ModeContext';
import { errorMessage } from '@/lib/errors';
import { listBookings, type BookingWithParties } from '@/lib/queries/bookings';
import { nextPage } from '@/lib/queries/client';
import { qk, type BookingListFilters } from '@/lib/queries/keys';
import { listMyTickets, type TicketWithEvent } from '@/lib/queries/orders';
import { layout, spacing, useTheme } from '@/theme';
import { isProviderAccount, TERMINAL_BOOKING_STATUSES } from '@/types/database';

type BookingsRole = 'seeker' | 'provider';
type BookingsWindow = 'upcoming' | 'past';

/**
 * One list item. Bookings and tickets share the list because a seeker does not
 * think of them as different things — both are "somewhere I am supposed to be".
 * They are sorted together by start time for the same reason.
 */
type BookingsRow =
  | { key: string; kind: 'booking'; startsAt: number; booking: BookingWithParties }
  | { key: string; kind: 'ticket'; startsAt: number; ticket: TicketWithEvent };

const WINDOW_OPTIONS: readonly SegmentedOption<BookingsWindow>[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
];

/** The heading. With the toggle gone, this is what says which side you are on. */
const ROLE_TITLE: Record<BookingsRole, string> = {
  seeker: 'Booked by me',
  provider: 'Booked with me',
};

/**
 * =============================================================================
 * Bookings
 * =============================================================================
 *
 * One screen, two audiences, and the audience is a property of the account
 * rather than of the screen:
 *
 *   seeking mode   sessions you booked and tickets you hold
 *   hosting mode   sessions other people booked with you
 *
 * There is no toggle on this screen. Mode owns the answer, and mode is already
 * legible from the tab bar before you read the heading — see the note on
 * `role` below. A seeker is clamped to seeking and never sees the hosting
 * side, which for them would be permanently empty.
 *
 * The Upcoming/Past split is `listBookings`' `window` filter, which excludes
 * terminal statuses from Upcoming server-side. That leaves a gap the UI has to
 * close: a booking cancelled *before* its start date is in neither window until
 * its time passes. The Past segment therefore also asks for
 * `TERMINAL_BOOKING_STATUSES` with no window and merges the results, so a
 * cancellation does not simply vanish from the app for a fortnight.
 *
 * All three queries are infinite. `listBookings` and `listMyTickets` take a
 * page and default it to 0, so calling them without one silently truncates the
 * list at `PAGE_SIZE` with nothing on screen to say so — the twenty-first
 * booking simply did not exist. Tickets need more than `onEndReached` on top of
 * that: they have no server-side window filter, so a whole page of them can
 * land on the other side of the Upcoming/Past split and contribute no rows at
 * all, leaving no content for the end-of-list callback to fire against.
 */
export default function BookingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session, profile, profileError, refreshProfile } = useAuth();
  const { mode, isResolving: modeResolving } = useMode();

  const userId = session?.user.id ?? '';
  const canSwitchRole = profile !== null && isProviderAccount(profile.account_type);

  // Signed out: the queries below are all keyed on a user id, so there is
  // nothing to fetch and nothing to show but the offer.
  const signedOut = userId === '';

  // Mode decides this outright — there is no longer a toggle on this screen.
  //
  // There used to be one, wired to the same mode, which meant two controls for
  // one piece of state and the less prominent of the two silently changed the
  // whole app. It could go because mode is now unmistakable: the avatar in the
  // tab bar is ringed purple while hosting and green while seeking, and the
  // first tab is Listings rather than Discover. The answer to "whose bookings
  // am I looking at" is already on screen before you read this heading.
  //
  // Hosting shows what people booked with you; seeking shows what you booked.
  // A practitioner reaches their own bookings by switching to seeking — hold
  // the Profile tab — which is the whole reason mode exists: a practitioner
  // books other practitioners too.
  const role: BookingsRole = mode === 'hosting' ? 'provider' : 'seeker';
  const [window, setWindow] = useState<BookingsWindow>('upcoming');

  // A seeker account can never be in provider mode, even if the toggle was
  // used before the profile finished loading.
  const effectiveRole: BookingsRole = canSwitchRole ? role : 'seeker';

  const filters: BookingListFilters = useMemo(
    () => ({ role: effectiveRole, window }),
    [effectiveRole, window],
  );

  const bookings = useInfiniteQuery({
    queryKey: qk.bookings.list(filters),
    queryFn: ({ pageParam }) => listBookings(userId, filters, pageParam),
    initialPageParam: 0,
    // Wrapped rather than passed by reference: React Query calls
    // `getNextPageParam(lastPage, allPages, lastPageParam, allPageParams)`,
    // so `nextPage`'s third parameter would receive the page INDEX instead of
    // the page size. On page 0 that makes the test `lastPage.length < 0`,
    // which is never true, so a short final page is never detected and the
    // list keeps asking for more.
    getNextPageParam: (lastPage, allPages) => nextPage(lastPage, allPages),
    enabled: userId !== '',
  });

  // Cancelled and declined bookings whose date has not arrived yet. Only the
  // Past segment needs them.
  const closedFilters: BookingListFilters = useMemo(
    () => ({ role: effectiveRole, statuses: TERMINAL_BOOKING_STATUSES }),
    [effectiveRole],
  );

  const closed = useInfiniteQuery({
    queryKey: qk.bookings.list(closedFilters),
    queryFn: ({ pageParam }) => listBookings(userId, closedFilters, pageParam),
    initialPageParam: 0,
    // Wrapped rather than passed by reference: React Query calls
    // `getNextPageParam(lastPage, allPages, lastPageParam, allPageParams)`,
    // so `nextPage`'s third parameter would receive the page INDEX instead of
    // the page size. On page 0 that makes the test `lastPage.length < 0`,
    // which is never true, so a short final page is never detected and the
    // list keeps asking for more.
    getNextPageParam: (lastPage, allPages) => nextPage(lastPage, allPages),
    enabled: userId !== '' && window === 'past',
  });

  // Tickets are the seeker's side only. A provider looking at their own
  // schedule wants attendees, which is the event's own screen.
  const tickets = useInfiniteQuery({
    queryKey: qk.tickets.mine,
    queryFn: ({ pageParam }) => listMyTickets(userId, pageParam),
    initialPageParam: 0,
    // Wrapped rather than passed by reference: React Query calls
    // `getNextPageParam(lastPage, allPages, lastPageParam, allPageParams)`,
    // so `nextPage`'s third parameter would receive the page INDEX instead of
    // the page size. On page 0 that makes the test `lastPage.length < 0`,
    // which is never true, so a short final page is never detected and the
    // list keeps asking for more.
    getNextPageParam: (lastPage, allPages) => nextPage(lastPage, allPages),
    enabled: userId !== '' && effectiveRole === 'seeker',
  });

  const bookingPages = useMemo(() => bookings.data?.pages.flat() ?? [], [bookings.data]);
  const closedPages = useMemo(() => closed.data?.pages.flat() ?? [], [closed.data]);
  const ticketPages = useMemo(() => tickets.data?.pages.flat() ?? [], [tickets.data]);

  // Partitioning tickets into upcoming/past needs a clock, and reading one
  // during render is impure — the same list would sort differently on a
  // re-render that happened to straddle an event's end time. Sample it once on
  // mount and re-sample on pull-to-refresh, which is when the user is asking
  // for fresh answers anyway.
  const [now, setNow] = useState(() => Date.now());

  const rows = useMemo<BookingsRow[]>(() => {
    const collected: BookingsRow[] = [];
    const seen = new Set<string>();

    const pushBooking = (booking: BookingWithParties) => {
      if (seen.has(booking.id)) return;
      seen.add(booking.id);
      collected.push({
        key: `booking:${booking.id}`,
        kind: 'booking',
        startsAt: new Date(booking.starts_at).getTime(),
        booking,
      });
    };

    for (const booking of bookingPages) pushBooking(booking);
    if (window === 'past') for (const booking of closedPages) pushBooking(booking);

    if (effectiveRole === 'seeker') {
      for (const ticket of ticketPages) {
        // `listMyTickets` has no window filter, so the split happens here. An
        // event that has started but not finished still counts as upcoming —
        // you can still walk in.
        const endsAt = ticket.event?.ends_at ?? ticket.event?.starts_at ?? null;
        const isUpcoming = endsAt !== null && new Date(endsAt).getTime() >= now;
        if (isUpcoming !== (window === 'upcoming')) continue;

        collected.push({
          key: `ticket:${ticket.id}`,
          kind: 'ticket',
          startsAt: ticket.event ? new Date(ticket.event.starts_at).getTime() : 0,
          ticket,
        });
      }
    }

    // Upcoming reads soonest-first; Past reads most-recent-first.
    const direction = window === 'upcoming' ? 1 : -1;
    return collected.sort((a, b) => (a.startsAt - b.startsAt) * direction);
  }, [bookingPages, closedPages, ticketPages, effectiveRole, window, now]);

  // A disabled query sits in `pending` forever, so each branch is guarded by
  // the same condition that enables it.
  const isPending =
    bookings.isPending ||
    (window === 'past' && closed.isPending) ||
    (effectiveRole === 'seeker' && tickets.isPending);

  const isRefreshing =
    bookings.isRefetching || closed.isRefetching || tickets.isRefetching;

  const isFetchingMore =
    bookings.isFetchingNextPage || closed.isFetchingNextPage || tickets.isFetchingNextPage;

  const hasMore =
    bookings.hasNextPage ||
    (window === 'past' && closed.hasNextPage) ||
    (effectiveRole === 'seeker' && tickets.hasNextPage);

  const loadMore = () => {
    if (bookings.hasNextPage && !bookings.isFetchingNextPage) void bookings.fetchNextPage();
    if (window === 'past' && closed.hasNextPage && !closed.isFetchingNextPage) {
      void closed.fetchNextPage();
    }
    if (effectiveRole === 'seeker' && tickets.hasNextPage && !tickets.isFetchingNextPage) {
      void tickets.fetchNextPage();
    }
  };

  // Tickets are paged by `created_at` but shown split by event date, so a page
  // can contribute nothing to the window being viewed. When that happens there
  // is no row for `onEndReached` to fire against and the rest of the tickets
  // are unreachable, so keep pulling until one lands or the pages run out.
  const visibleTicketCount = rows.reduce((n, row) => (row.kind === 'ticket' ? n + 1 : n), 0);

  useEffect(() => {
    if (effectiveRole !== 'seeker') return;
    if (visibleTicketCount > 0) return;
    if (!tickets.hasNextPage || tickets.isFetchingNextPage) return;
    void tickets.fetchNextPage();
  }, [effectiveRole, visibleTicketCount, tickets]);

  const refreshAll = () => {
    setNow(Date.now());
    void bookings.refetch();
    if (window === 'past') void closed.refetch();
    if (effectiveRole === 'seeker') void tickets.refetch();
  };

  // Tickets failing is not a reason to hide the sessions that loaded fine.
  const sideError =
    (effectiveRole === 'seeker' && tickets.isError ? tickets.error : null) ??
    (window === 'past' && closed.isError ? closed.error : null);

  const header = (
    <View style={styles.header}>
      {/* Was "Bookings", duplicating the nav bar directly above it. Now that
          the role toggle is gone this line is the only thing on screen that
          says whose bookings these are, so it does that job instead. */}
      <Text variant="h2" heading={1}>
        {ROLE_TITLE[effectiveRole]}
      </Text>

      <Segmented
        options={WINDOW_OPTIONS}
        value={window}
        onChange={setWindow}
        accessibilityLabel="Which bookings to show"
        testID="bookings-window-segmented"
      />
    </View>
  );

  if (signedOut) {
    return (
      <SignedOut
        screenTitle="Bookings"
        headline="Log in to see your bookings"
        description="Sessions you book and tickets you buy appear here, with everything you need on the day."
      />
    );
  }

  /*
   * Which bookings this screen shows depends on mode, and mode depends on two
   * async sources. Rendering before they settle showed a hosting practitioner
   * the seeker view — wrong heading, wrong empty state, and a wasted query for
   * their own bookings — then swapped it underneath them.
   */
  if (modeResolving) {
    return (
      <Screen>
        {header}
        <View accessibilityLiveRegion="polite" accessibilityLabel="Loading your bookings">
          <SkeletonList count={4} itemHeight={132} />
        </View>
      </Screen>
    );
  }

  /*
   * A profile that failed to load is NOT a seeker.
   *
   * `canHost` is false without a profile, so a failed fetch quietly demoted a
   * practitioner to the seeker view and left them there — no error, no retry,
   * and their own bookings replaced by somebody else's empty state. Guessing is
   * the wrong move when the guess is invisible: say it failed and offer the
   * retry.
   */
  if (profileError !== null && profile === null) {
    return (
      <Screen>
        {header}
        <ErrorState
          error={profileError}
          onRetry={() => void refreshProfile()}
          title="Could not load your account"
        />
      </Screen>
    );
  }

  if (isPending) {
    return (
      <Screen>
        {header}
        <View accessibilityLiveRegion="polite" accessibilityLabel="Loading your bookings">
          <SkeletonList count={4} itemHeight={132} />
        </View>
      </Screen>
    );
  }

  if (bookings.isError) {
    return (
      <Screen>
        {header}
        <ErrorState error={bookings.error} onRetry={() => void bookings.refetch()} />
      </Screen>
    );
  }

  const empty =
    effectiveRole === 'provider' ? (
      <EmptyState
        icon="calendar-outline"
        title={window === 'upcoming' ? 'Nothing booked with you yet' : 'No past sessions'}
        description={
          window === 'upcoming'
            ? 'When someone books time with you, their request lands here for you to confirm. Nothing can be booked unless a service is active and your hours are published.'
            : 'Sessions you have finished, declined or cancelled will be listed here.'
        }
        {...(window === 'upcoming'
          ? {
              actionLabel: 'Check your listings',
              onAction: () => router.push('/(tabs)/listings'),
            }
          : {})}
      />
    ) : (
      <EmptyState
        icon="calendar-outline"
        title={window === 'upcoming' ? 'Nothing coming up' : 'No past bookings'}
        description={
          window === 'upcoming'
            ? 'Sessions you book and tickets you buy will show up here.'
            : 'Sessions and events you have already been to will be listed here.'
        }
        {...(window === 'upcoming'
          ? { actionLabel: 'Find something', onAction: () => router.push('/(tabs)') }
          : {})}
      />
    );

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        style={styles.flex}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshAll} />}
        ListHeaderComponent={
          <View>
            {header}
            {sideError ? (
              <View style={styles.sideError} accessibilityRole="alert">
                <Text variant="bodySmall" color="danger">
                  {errorMessage(sideError)}
                </Text>
                <Button label="Try again" onPress={refreshAll} variant="ghost" size="sm" />
              </View>
            ) : null}
          </View>
        }
        // An empty list while more pages are still coming is not "you have
        // nothing" — it is "we have not looked yet".
        ListEmptyComponent={hasMore || isFetchingMore ? null : empty}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isFetchingMore ? (
            <View
              style={styles.footer}
              accessibilityLiveRegion="polite"
              accessibilityLabel="Loading more bookings"
            >
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : null
        }
        renderItem={({ item }) =>
          item.kind === 'booking' ? (
            <BookingCard
              booking={item.booking}
              viewerRole={effectiveRole}
              onPress={() =>
                router.push({ pathname: '/booking/[id]', params: { id: item.booking.id } })
              }
            />
          ) : (
            <TicketCard
              ticket={item.ticket}
              // No event embed means nowhere to navigate. `TicketCard` drops the
              // button role entirely rather than offering a tap that does
              // nothing.
              {...(item.ticket.event
                ? {
                    onPress: () =>
                      router.push({
                        pathname: '/event/[id]',
                        params: { id: item.ticket.event?.id ?? '' },
                      }),
                  }
                : {})}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  flex: {
    flex: 1,
  },
  list: {
    // DESIGN_SOURCE.md §"Spacing": `.gap-32` collapses to 16 on small screens,
    // which is `layout.cardGap`. This list was on 12.
    gap: layout.cardGap,
    paddingBottom: spacing.xl,
  },
  footer: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  sideError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
});
