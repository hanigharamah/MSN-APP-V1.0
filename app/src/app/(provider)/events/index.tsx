import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';

import {
  HostEventRow,
  ticketsSoldByEvent,
  ticketsSoldKey,
} from '@/components/provider-tools/events';
import { Button, EmptyState, ErrorState, Screen, SkeletonList, Text } from '@/components/ui';
import { useRequiredUserId } from '@/context/AuthContext';
import { nextPage } from '@/lib/queries/client';
import { listEventsHostedBy } from '@/lib/queries/events';
import { qk } from '@/lib/queries/keys';
import { spacing } from '@/theme';
import type { EventRow, EventStatus } from '@/types/database';

/**
 * "My events" — everything the signed-in user hosts, drafts included.
 *
 * `listEventsHostedBy` does not filter by status: RLS already restricts
 * other people's drafts, and a host tool that hid its own drafts would hide
 * the only place they can be finished. Grouping by status is what replaces
 * that filter — a draft and a live event need different attention, and the
 * section header is where a host looks first.
 *
 * Sold counts come from one query for the whole page rather than one per row.
 * They are event-wide totals of `ticket_types.quantity_sold`; a recurring
 * event's dates share one pool, so there is no per-date figure to show.
 */

/** Section order: what needs attention, then what is running, then history. */
const STATUS_ORDER: readonly EventStatus[] = [
  'draft',
  'published',
  'completed',
  'cancelled',
  'archived',
];

const STATUS_TITLE: Record<EventStatus, string> = {
  draft: 'Drafts',
  published: 'Live',
  completed: 'Finished',
  cancelled: 'Cancelled',
  archived: 'Archived',
};

interface EventSection {
  title: string;
  status: EventStatus;
  data: EventRow[];
}

export default function MyEventsScreen() {
  const hostId = useRequiredUserId();
  const router = useRouter();

  const list = useInfiniteQuery({
    queryKey: qk.events.hosting(hostId),
    queryFn: ({ pageParam }) => listEventsHostedBy(hostId, pageParam),
    initialPageParam: 0,
    // Wrapped rather than passed by reference: React Query hands
    // `getNextPageParam` four arguments and `nextPage`'s third is `pageSize`,
    // so a bare reference receives `lastPageParam` as the page size and stops
    // detecting the short final page. See the same note in `(tabs)/index.tsx`.
    getNextPageParam: (lastPage, allPages) => nextPage(lastPage, allPages),
  });

  const events = useMemo(() => list.data?.pages.flat() ?? [], [list.data]);
  const eventIds = useMemo(() => events.map((event) => event.id), [events]);

  // Deliberately not gated on the list's success: an event with no tiers
  // simply has no row here, and a failed count leaves the rows saying
  // "Counting…" rather than replacing the whole screen with an error.
  const sold = useQuery({
    queryKey: ticketsSoldKey(hostId, eventIds),
    queryFn: () => ticketsSoldByEvent(eventIds),
    enabled: eventIds.length > 0,
  });

  const sections = useMemo<EventSection[]>(() => {
    return STATUS_ORDER.map((status) => ({
      status,
      title: STATUS_TITLE[status],
      data: events.filter((event) => event.status === status),
    })).filter((section) => section.data.length > 0);
  }, [events]);

  const newEvent = () => router.push('/(provider)/events/new');

  if (list.isPending) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'My events' }} />
        <SkeletonList count={4} />
      </Screen>
    );
  }

  if (list.isError) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'My events' }} />
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      </Screen>
    );
  }

  if (events.length === 0) {
    return (
      <Screen safeBottom>
        <Stack.Screen options={{ title: 'My events' }} />
        <EmptyState
          icon="calendar-outline"
          title="No events yet"
          description="Create one as a draft, add your ticket tiers, then publish it when it is ready."
          actionLabel="New event"
          onAction={newEvent}
        />
      </Screen>
    );
  }

  return (
    <Screen edgeToEdge safeBottom>
      <Stack.Screen options={{ title: 'My events' }} />

      <SectionList
        sections={sections}
        keyExtractor={(event) => event.id}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="h2" heading={1}>
              My events
            </Text>
            <Button
              label="New"
              size="sm"
              onPress={newEvent}
              accessibilityLabel="New event"
              accessibilityHint="Opens the form for a new draft event"
            />
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text variant="h4" heading={2} style={styles.sectionHeader}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <HostEventRow
              event={item}
              ticketsSold={sold.data?.[item.id] ?? (sold.isSuccess ? 0 : null)}
              onPress={() => router.push(`/(provider)/events/${item.id}`)}
            />
          </View>
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <View style={styles.footer}>
              <SkeletonList count={1} />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sectionHeader: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  row: {
    marginBottom: spacing.xs,
  },
  footer: {
    marginTop: spacing.xs,
  },
});
