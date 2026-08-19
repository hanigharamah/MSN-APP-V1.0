import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import {
  AdminNotice,
  QueueRow,
  SearchEntry,
  adminQueueKeys,
  listAwaitingVerification,
  listOpenReports,
  listPendingRefunds,
  refundQueueItem,
  reportQueueItem,
  sortQueue,
  verificationQueueItem,
  waitingCountLabel,
  type QueueItem,
} from '@/components/admin';
import { EmptyState, ErrorState, Screen, SkeletonList, Text } from '@/components/ui';
import { SCREEN_GUTTER, spacing } from '@/theme';

/**
 * =============================================================================
 * The admin home screen — one queue of decisions
 * =============================================================================
 *
 * ## The only question this screen answers
 *
 * "What needs me right now?" That is the entire brief, and everything below is
 * downstream of it.
 *
 * There is no dashboard, no table list, no record browser and no metric. Not
 * because those are hard, but because they are the failure mode: an admin tool
 * that mirrors the schema hands the operator every table and leaves them to
 * work out what is actually waiting. The three things that are genuinely
 * waiting — an undecided refund, an unhandled report, an unverified
 * practitioner — go in one list, most urgent first, and everything else is
 * reachable from the item that raised it.
 *
 * Three tables, one list, and the list is sorted by *how long a person has
 * been kept waiting*, not by table. A refund from Tuesday and a report from
 * Tuesday are equally overdue and sit next to each other.
 *
 * ## Why three queries rather than one
 *
 * Each part is keyed under the `qk` prefix its table already has
 * (`adminQueueKeys`), so when the pass that owns `/(admin)/reports/[id]` and
 * `/(admin)/people/[id]` resolves a report or verifies an account, its own
 * invalidation empties the row here. One combined key would need both passes to
 * know about each other.
 *
 * It also means partial failure is survivable, and that is handled rather than
 * hidden: if reports load and refunds do not, the operator sees the reports
 * **and a notice naming what is missing**. Silently showing two thirds of a
 * queue is the worst outcome available — it looks exactly like an empty one.
 *
 * ## An empty queue is the good ending
 *
 * "Nothing needs you right now" is a success state, not an error and not an
 * illustration of failure. It gets a calm tick, and the search entry points
 * stay put underneath, because "nobody is waiting" and "I need to look someone
 * up" are unrelated facts.
 */
export default function AdminQueueScreen() {
  const router = useRouter();

  const refunds = useQuery({
    queryKey: adminQueueKeys.refunds.pending,
    queryFn: listPendingRefunds,
  });
  const reports = useQuery({
    queryKey: adminQueueKeys.reports.open,
    queryFn: listOpenReports,
  });
  const verification = useQuery({
    queryKey: adminQueueKeys.verification.pending,
    queryFn: listAwaitingVerification,
  });

  /**
   * One clock for the whole render.
   *
   * Every pill and every urgency in a single pass is computed from the same
   * instant. Letting each row call `new Date()` gives rows a few milliseconds
   * apart, which is invisible until a request sits exactly on a midnight
   * boundary and two rows disagree about what day it is.
   */
  const items = useMemo<QueueItem[]>(() => {
    const now = new Date();
    return sortQueue([
      ...(refunds.data ?? []).map((refund) => refundQueueItem(refund, now)),
      ...(reports.data ?? []).map((report) => reportQueueItem(report, now)),
      ...(verification.data ?? []).map((account) => verificationQueueItem(account, now)),
    ]);
  }, [refunds.data, reports.data, verification.data]);

  const parts = [
    { name: 'refunds', query: refunds },
    { name: 'reports', query: reports },
    { name: 'verifications', query: verification },
  ] as const;

  const allPending = parts.every((part) => part.query.isPending);
  const allFailed = parts.every((part) => part.query.isError);
  const failed = parts.filter((part) => part.query.isError);
  const refreshing = parts.some((part) => part.query.isRefetching);

  const refetchAll = () => {
    for (const part of parts) void part.query.refetch();
  };

  if (allPending) {
    return (
      <Screen>
        <View style={styles.header} accessibilityLiveRegion="polite">
          <Text variant="h2" heading={1}>
            What needs you
          </Text>
        </View>
        <SkeletonList count={5} itemHeight={112} />
      </Screen>
    );
  }

  // Only when every part failed. One broken query must never blank a queue
  // that still has real people waiting in it.
  if (allFailed) {
    return (
      <Screen>
        <ErrorState error={refunds.error} onRetry={refetchAll} title="Could not load the queue" />
      </Screen>
    );
  }

  return (
    <Screen edgeToEdge safeBottom>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="h2" heading={1}>
              What needs you
            </Text>
            {items.length > 0 ? (
              <Text variant="bodySmall" color="muted">
                {waitingCountLabel(items.length)}
              </Text>
            ) : null}

            {failed.length > 0 ? (
              <AdminNotice
                tone="danger"
                title={`${failed.map((part) => part.name).join(' and ')} could not be loaded`}
                body="This list is incomplete — there may be people waiting who are not shown. Pull down to try again."
              />
            ) : null}

            {/* Search sits ABOVE the queue, not below it. As a footer these two
                rows were unreachable without scrolling past every waiting item
                — on a full queue nobody ever saw them, so two of admin's three
                sections were effectively invisible. The queue is still the
                point of the screen; search is just no longer hidden behind it. */}
            <View style={styles.search}>
              <SearchEntry
                icon="person-outline"
                label="Find someone"
                hint="Search accounts by name, handle or email"
                onPress={() => router.push('/(admin)/people' as Href)}
              />
              <SearchEntry
                icon="pricetag-outline"
                label="Find a listing"
                hint="Search events and services, drafts included"
                onPress={() => router.push('/(admin)/listings' as Href)}
              />
              <SearchEntry
                icon="cash-outline"
                label="Money"
                hint="What came in, and what is owed out"
                onPress={() => router.push('/(admin)/money' as Href)}
              />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <QueueRow item={item} onPress={() => router.push(hrefFor(item))} />
          </View>
        )}
        ListEmptyComponent={
          // Deliberately not shown while a part of the queue is still failing:
          // "nothing needs you" would be a lie sitting directly under a notice
          // saying we could not check.
          failed.length > 0 ? null : (
            <EmptyState
              icon="checkmark-done-outline"
              title="Nothing needs you right now"
              description="Refunds, reports and practitioners awaiting verification appear here the moment they are raised."
            />
          )
        }
      />
    </Screen>
  );
}

/**
 * The queue item's destination, as a route.
 *
 * `QueueItem.href` is a plain string because three of the four destinations —
 * `/(admin)/reports/[id]`, `/(admin)/people/[id]`, `/(admin)/people` and
 * `/(admin)/listings` — are route files owned by a concurrent pass, and
 * expo-router's generated `Href` union only contains routes whose files exist.
 * Typing the model against a union that changes as another agent saves files
 * would make this screen's compilation depend on their timing.
 *
 * TODO(agent · admin): once every `(admin)` route file exists, delete this and
 * type `QueueItem.href` as `Href` so a typo is a compile error again.
 */
function hrefFor(item: QueueItem): Href {
  return item.href as Href;
}

const styles = StyleSheet.create({
  search: { gap: spacing.xs, marginTop: spacing.sm },
  content: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingBottom: spacing.xl,
    flexGrow: 1,
  },
  header: {
    gap: spacing.xxs,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: {
    marginBottom: spacing.xs,
  },
});
