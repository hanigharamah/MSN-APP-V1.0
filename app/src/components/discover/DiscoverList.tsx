import type { ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import {
  Button,
  EmptyState,
  ErrorState,
  SkeletonList,
  Text,
  type EmptyStateProps,
} from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { SCREEN_GUTTER, borderWidths, radii, spacing, useTheme } from '@/theme';

export interface DiscoverListProps<T> {
  items: readonly T[];
  keyOf: (item: T) => string;
  renderCard: (item: T) => ReactElement;

  isPending: boolean;
  isError: boolean;
  error: unknown;
  isRefetching: boolean;
  onRefresh: () => void;
  onRetry: () => void;

  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onEndReached: () => void;

  empty: EmptyStateProps;
  /** Height of one placeholder card. Match the real card so nothing jumps. */
  skeletonHeight: number;
  /**
   * Cards per row. 1 is a full-width list; 2 is the compact grid.
   *
   * FlatList rebuilds its internal layout when `numColumns` changes, so this
   * must be fixed for the life of a list instance — the two Discover tabs pass
   * different values but are separate instances with different `key`s.
   */
  columns?: 1 | 2;
  /** Announced when the list finishes loading, e.g. "12 events". */
  resultsLabel: string;
}

/**
 * The results area: one list, four states, infinite scroll and pull to refresh.
 *
 * The web listing paginates with numbered pages (`EventsListing.vue:1146`,
 * page size 6, and `Shared/TablePagination.vue` renders every page number with
 * no windowing). DESIGN_SOURCE §6.1 already recommends against porting that,
 * and `PaginationMixin` even carries an unused `loadMore()`. This is that
 * `loadMore`, driven by `onEndReached` — no page numbers, no footer row, and
 * `PAGE_SIZE` 20 instead of 6, because a phone screen shows two cards and six
 * per fetch would mean tapping "next" almost immediately.
 *
 * All four branches are mandatory per CONVENTIONS §3, and the error and empty
 * branches deliberately render *inside* the scroll view so pull-to-refresh
 * still works when there is nothing to pull.
 *
 * ## Errors come in two shapes, and only one of them is empty
 *
 * `ListEmptyComponent` mounts only at zero items, so it covers the first load
 * failing and nothing else. Once a page has landed, React Query keeps `data`
 * and flips `isError` — which is what a failed pull-to-refresh and a failed
 * `fetchNextPage` both look like. Routing those through `ListEmptyComponent`
 * would have shown the user nothing at all: the spinner disappears, no row
 * appears, and the list simply stops. The footer below is that second shape,
 * and it carries its own retry because the whole-screen `ErrorState` is not on
 * screen to carry one.
 */
export function DiscoverList<T>({
  items,
  keyOf,
  renderCard,
  isPending,
  isError,
  error,
  isRefetching,
  onRefresh,
  onRetry,
  hasNextPage,
  isFetchingNextPage,
  onEndReached,
  empty,
  skeletonHeight,
  columns = 1,
  resultsLabel,
}: DiscoverListProps<T>) {
  const theme = useTheme();

  if (isPending) {
    return (
      <View
        style={styles.pending}
        accessibilityLiveRegion="polite"
        accessibilityLabel="Loading results"
      >
        <SkeletonList count={3} itemHeight={skeletonHeight} />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      // Explicit flex, not the default: the list is the second child of a
      // column flex container with a pinned header above it, and a ScrollView
      // with no flex sizes to its content and overflows the screen.
      style={styles.list}
      keyExtractor={keyOf}
      numColumns={columns}
      // Only a grid needs a row wrapper. Passing one at a single column throws.
      {...(columns > 1 ? { columnWrapperStyle: styles.row } : {})}
      renderItem={({ item }) => (
        // The cell has to carry the width, not the card: a card sized to
        // `flex: 1` would stretch to the row's tallest sibling, and two cards
        // with different title lengths would then disagree on image height.
        <View style={columns > 1 ? styles.cell : undefined}>{renderCard(item)}</View>
      )}
      contentContainerStyle={[
        styles.content,
        items.length === 0 ? styles.contentCentred : null,
      ]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={resultsLabel}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={onRefresh}
          tintColor={theme.colors.accent}
          colors={[theme.colors.accent]}
        />
      }
      onEndReached={hasNextPage && !isFetchingNextPage ? onEndReached : null}
      onEndReachedThreshold={0.6}
      // Tapping a card while the keyboard is up should open the card, not just
      // dismiss the keyboard and make the user tap twice.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        isError ? <ErrorState error={error} onRetry={onRetry} /> : <EmptyState {...empty} />
      }
      ListFooterComponent={
        isFetchingNextPage ? (
          <View style={styles.footer}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : isError && items.length > 0 ? (
          <View
            style={[
              styles.footerError,
              { backgroundColor: theme.colors.dangerSubtle, borderColor: theme.colors.border },
            ]}
            // Deliberately NOT `accessible` on the wrapper: collapsing it into
            // one node would take the retry button out of the focus order, and
            // an error the user can hear but not act on is worse than the
            // silence this block exists to fix. The live region announces, the
            // Text and the Button stay two separate stops.
            accessibilityLiveRegion="polite"
          >
            <Text variant="bodySmall" color="danger" align="center" accessibilityRole="alert">
              {`Could not load more. ${errorMessage(error)}`}
            </Text>
            <Button label="Try again" onPress={onRetry} variant="secondary" size="sm" />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  pending: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  row: {
    gap: spacing.sm,
  },
  cell: {
    flex: 1,
  },
  contentCentred: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  footer: {
    paddingVertical: spacing.md,
  },
  footerError: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: borderWidths.hairline,
  },
});
