import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  DiscoverList,
  EventCard,
  FilterChipRow,
  PractitionerCard,
  SearchField,
  SegmentedControl,
  fromEventRow,
  fromEventSearchResult,
  retreatCategoryIds,
  EventFiltersSheet,
  EMPTY_FILTERS,
  PRICE_BANDS,
  activeFilterCount,
  useNearMe,
  NEAR_ME_RADIUS_KM,
  type EventFilterState,
  useDebouncedValue,
  type DiscoverEvent,
  type SegmentedOption,
} from '@/components/discover';
import { Screen, Text } from '@/components/ui';
import { nextPage } from '@/lib/queries/client';
import { listCategories, listEvents, searchEvents } from '@/lib/queries/events';
import { qk, type EventListFilters } from '@/lib/queries/keys';
import { listSpecialities, searchProviders, type ProviderSearchFilters } from '@/lib/queries/profiles';
import { radii, SCREEN_GUTTER, spacing, useTheme } from '@/theme';
import type { Profile } from '@/types/database';

/**
 * Discover — search, browse and open anything the marketplace sells.
 *
 * ## Shape
 *
 * The web app's `/all-events` (`EventsListing.vue`, 3,952 lines) is the entire
 * marketplace search: a hero carousel, four tabs, a desktop filter sidebar that
 * is hidden below 768px and duplicated wholesale into a mobile offcanvas, and
 * numbered pagination at six results a page. DESIGN_SOURCE §6.1 and §9.17 both
 * recommend against porting the behaviour, and this screen follows that:
 *
 *   | Web                          | Here                                     |
 *   |------------------------------|------------------------------------------|
 *   | Numbered pagination, page 6  | Infinite scroll, `PAGE_SIZE` 20          |
 *   | Hover states on cards        | Pressed states                           |
 *   | Filter sidebar / offcanvas   | An always-visible chip row               |
 *   | 4 tabs incl. Organizers, Businesses | 2 segments; `searchProviders` already returns every non-seeker account type |
 *   | Full-bleed hero carousel     | Dropped — see below                      |
 *
 * The hero carousel is the one piece of chrome deliberately left out. It costs
 * 176pt at the top of a phone screen, carries no result, and the pinned search
 * field is what a native user reaches for first. Its slot is available if
 * marketing wants it back.
 *
 * ## Query routing
 *
 * CONVENTIONS §5: `searchEvents` (the `search_events` RPC) whenever there is a
 * text query, `listEvents` for a plain browse. Both are wired, both feed the
 * same card through the adapters in `event-model.ts`, and the debounced search
 * term is what switches between them. Full-text ranking and proximity are not
 * expressible through PostgREST, so nothing here filters on the phone.
 *
 * ## Not here on purpose
 *
 * - **Proximity / "near me".** `EventListFilters.near` exists and
 *   `search_events` takes `near_lat`/`near_lng`, but the practitioner half has
 *   no equivalent (see the TODO on `searchProviders`), and a filter that
 *   silently applies to one tab and not the other is worse than no filter.
 * - **Save to favourites.** Belongs to whoever owns `saved_items`.
 */

type DiscoverTab = 'events' | 'practitioners';

const TABS: readonly SegmentedOption<DiscoverTab>[] = [
  { value: 'events', label: 'Events' },
  { value: 'practitioners', label: 'Practitioners' },
];

/** Matches the rendered card height closely enough that nothing jumps. */
// Compact grid card: a square cover on a half-width column, plus title, host
// and one meta line. Kept in step with `EventCard`'s compact variant so the
// skeletons do not jump when the real cards land.
const EVENT_CARD_HEIGHT = 250;
// Compact grid card: a square photo on a half-width column, plus name,
// headline and the rating slot. Matches `PractitionerCard`'s compact variant so
// the skeletons do not jump when the real cards land.
const PRACTITIONER_CARD_HEIGHT = 268;

export default function DiscoverScreen() {
  const router = useRouter();

  const [tab, setTab] = useState<DiscoverTab>('events');
  const [searchDraft, setSearchDraft] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [specialityId, setSpecialityId] = useState<string | undefined>(undefined);
  const [filters, setFilters] = useState<EventFilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const nearMe = useNearMe();

  // The field repaints on every keystroke; only the settled value reaches a
  // query key, so the cache does not collect an entry per character.
  const search = useDebouncedValue(searchDraft.trim());
  const isSearching = search.length > 0;

  /* --- filter taxonomies ------------------------------------------------ */
  // Two taxonomies, because they filter two different tables: `events` carries
  // `category_id`, practitioners carry specialities through a join table.
  // Showing category chips over a practitioner list would offer a filter
  // `ProviderSearchFilters` cannot express.
  const categories = useQuery({
    queryKey: qk.categories.list,
    queryFn: () => listCategories(),
    enabled: tab === 'events',
  });

  const specialities = useQuery({
    queryKey: qk.specialities.list,
    queryFn: () => listSpecialities(),
    enabled: tab === 'practitioners',
  });

  /* --- events ----------------------------------------------------------- */
  const eventFilters: EventListFilters = useMemo(() => {
    const band = PRICE_BANDS.find((option) => option.key === filters.priceBand);

    return {
      ...(isSearching ? { search } : {}),
      ...(categoryId === undefined ? {} : { categoryId }),
      ...(filters.deliveryModes.length > 0 ? { deliveryModes: filters.deliveryModes } : {}),
      ...(band?.freeOnly ? { onlyFree: true } : {}),
      ...(band?.minCents === undefined ? {} : { minPriceCents: band.minCents }),
      ...(band?.maxCents === undefined ? {} : { maxPriceCents: band.maxCents }),
      // Only once a fix has actually arrived. Keying off the switch alone would
      // put a `near` filter with undefined coordinates into the query the
      // moment somebody taps it, and again if they then refuse the prompt.
      ...(filters.nearMe && nearMe.coords
        ? {
            near: {
              latitude: nearMe.coords.latitude,
              longitude: nearMe.coords.longitude,
              radiusKm: NEAR_ME_RADIUS_KM,
            },
          }
        : {}),
    };
  }, [isSearching, search, categoryId, filters, nearMe.coords]);

  // `search_events` is the only path that can answer proximity, so a location
  // filter routes there even with an empty search box.
  const useSearchPath = isSearching || eventFilters.near !== undefined;

  const events = useInfiniteQuery({
    queryKey: qk.events.list(eventFilters),
    queryFn: async ({ pageParam }): Promise<DiscoverEvent[]> =>
      useSearchPath
        ? (
            await searchEvents(
              // `listEvents` floors `starts_at` at `now()` when `startsAfter` is
              // absent; `search_events` has no such default and simply omits the
              // predicate when `from_date` is null. Left alone, browsing hid
              // events that had already started and searching brought them back
              // — the same catalogue answering two different questions. Passed
              // at fetch time rather than folded into `eventFilters` so a clock
              // reading never lands in the query key and churns the cache.
              { ...eventFilters, startsAfter: eventFilters.startsAfter ?? new Date().toISOString() },
              pageParam,
            )
          ).map(fromEventSearchResult)
        : (await listEvents(eventFilters, pageParam)).map(fromEventRow),
    initialPageParam: 0,
    // Wrapped rather than passed by reference: React Query hands
    // `getNextPageParam` four arguments, and `nextPage`'s third is `pageSize`.
    getNextPageParam: (lastPage, allPages) => nextPage(lastPage, allPages),
    enabled: tab === 'events',
  });

  /* --- practitioners ---------------------------------------------------- */
  const providerFilters: ProviderSearchFilters = useMemo(
    () => ({
      ...(isSearching ? { search } : {}),
      ...(specialityId === undefined ? {} : { specialityId }),
    }),
    [isSearching, search, specialityId],
  );

  const providers = useInfiniteQuery({
    // `qk` has no provider-search key, so this is built from the `profiles`
    // prefix by hand — `invalidateQueries({ queryKey: qk.profiles.all })` still
    // clears it. A `qk.profiles.search(filters)` entry would be the tidy fix;
    // `lib/queries/keys.ts` belongs to another agent.
    queryKey: [...qk.profiles.all, 'search', providerFilters] as const,
    queryFn: ({ pageParam }): Promise<Profile[]> => searchProviders(providerFilters, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => nextPage(lastPage, allPages),
    enabled: tab === 'practitioners',
  });

  const retreatIds = useMemo(() => retreatCategoryIds(categories.data), [categories.data]);

  // The retreat flag is applied here rather than baked into the cached pages:
  // events and categories are separate requests, so whichever loses the race
  // would otherwise leave every card unlabelled until the next refetch.
  const eventItems = useMemo(
    () =>
      dedupeById(events.data?.pages).map((row) =>
        row.is_retreat || (row.category_id !== null && retreatIds.has(row.category_id))
          ? { ...row, is_retreat: true }
          : row,
      ),
    [events.data, retreatIds],
  );
  const providerItems = useMemo(() => dedupeById(providers.data?.pages), [providers.data]);

  return (
    <Screen edgeToEdge>
      {/* Pinned rather than scrolled away with the results. Search is the
          reason this screen exists, and keeping the field mounted is also what
          stops the keyboard collapsing every time the segment changes. */}
      <View style={styles.header}>
        <View style={styles.headerInset}>
          <View style={styles.searchRow}>
            <View style={styles.searchField}>
              <SearchField value={searchDraft} onChangeText={setSearchDraft} />
            </View>
            {tab === 'events' ? (
              <FiltersButton count={activeFilterCount(filters)} onPress={() => setFiltersOpen(true)} />
            ) : null}
          </View>
          <SegmentedControl
            options={TABS}
            value={tab}
            onChange={setTab}
            accessibilityLabel="Result type"
          />
        </View>

        {/* The `key` is load-bearing, not decoration. Both arms of this ternary
            are a `FilterChipRow` in the same slot, so without one React treats
            them as the same element and keeps the `ScrollView` underneath —
            including its horizontal scroll offset. Scrolling the category row
            to "Sound healing" and switching to Practitioners then opened the
            speciality row already scrolled past its first few chips, with no
            way to tell why. Same reasoning on the two `DiscoverList`s below,
            where the state being carried over is a `FlatList`'s scroll
            position and its windowing bookkeeping. */}
        {tab === 'events' ? (
          <FilterChipRow
            key="categories"
            options={categories.data}
            selectedId={categoryId}
            onSelect={setCategoryId}
            isPending={categories.isPending}
            isError={categories.isError}
            accessibilityLabel="Filter by category"
            noun="category"
          />
        ) : (
          <FilterChipRow
            key="specialities"
            options={specialities.data}
            selectedId={specialityId}
            onSelect={setSpecialityId}
            isPending={specialities.isPending}
            isError={specialities.isError}
            accessibilityLabel="Filter by speciality"
            noun="speciality"
          />
        )}
      </View>

      {tab === 'events' ? (
        <DiscoverList
          key="events"
          items={eventItems}
          keyOf={(event) => event.id}
          renderCard={(event) => (
            <EventCard
              compact
              event={event}
              onPress={() =>
                router.push({ pathname: '/(modal)/event/[id]', params: { id: event.id } })
              }
            />
          )}
          isPending={events.isPending}
          isError={events.isError}
          error={events.error}
          isRefetching={events.isRefetching && !events.isFetchingNextPage}
          onRefresh={() => void events.refetch()}
          onRetry={() => void events.refetch()}
          hasNextPage={events.hasNextPage}
          isFetchingNextPage={events.isFetchingNextPage}
          onEndReached={() => void events.fetchNextPage()}
          columns={2}
          skeletonHeight={EVENT_CARD_HEIGHT}
          resultsLabel={countLabel(eventItems.length, 'event', events.hasNextPage)}
          empty={
            isSearching || categoryId !== undefined
              ? {
                  icon: 'search-outline',
                  title: 'No events match',
                  description:
                    'Try a broader search, or clear the category filter to see everything coming up.',
                  actionLabel: 'Clear filters',
                  onAction: () => {
                    setSearchDraft('');
                    setCategoryId(undefined);
                  },
                }
              : {
                  icon: 'compass-outline',
                  title: 'Nothing scheduled yet',
                  description:
                    'There are no published events coming up. Practitioners are still taking one-to-one bookings.',
                  actionLabel: 'Browse practitioners',
                  onAction: () => setTab('practitioners'),
                }
          }
        />
      ) : (
        <DiscoverList
          key="practitioners"
          items={providerItems}
          keyOf={(profile) => profile.id}
          renderCard={(profile) => (
            <PractitionerCard
              compact
              profile={profile}
              onPress={() =>
                router.push({ pathname: '/(modal)/provider/[id]', params: { id: profile.id } })
              }
            />
          )}
          isPending={providers.isPending}
          isError={providers.isError}
          error={providers.error}
          isRefetching={providers.isRefetching && !providers.isFetchingNextPage}
          onRefresh={() => void providers.refetch()}
          onRetry={() => void providers.refetch()}
          hasNextPage={providers.hasNextPage}
          isFetchingNextPage={providers.isFetchingNextPage}
          onEndReached={() => void providers.fetchNextPage()}
          columns={2}
          skeletonHeight={PRACTITIONER_CARD_HEIGHT}
          resultsLabel={countLabel(providerItems.length, 'practitioner', providers.hasNextPage)}
          empty={
            isSearching || specialityId !== undefined
              ? {
                  icon: 'search-outline',
                  title: 'No practitioners match',
                  description:
                    'Try a different name or speciality, or clear the filter to see everyone.',
                  actionLabel: 'Clear filters',
                  onAction: () => {
                    setSearchDraft('');
                    setSpecialityId(undefined);
                  },
                }
              : {
                  icon: 'people-outline',
                  title: 'No practitioners yet',
                  description: 'Nobody is listed here right now. Have a look at what is on instead.',
                  actionLabel: 'Browse events',
                  onAction: () => setTab('events'),
                }
          }
        />
      )}

      <EventFiltersSheet
        visible={filtersOpen}
        state={filters}
        nearMe={nearMe}
        onChange={setFilters}
        onClose={() => setFiltersOpen(false)}
      />
    </Screen>
  );
}

/**
 * Flattens the pages of an infinite query, dropping any row already seen.
 *
 * Both feeds paginate with `LIMIT`/`OFFSET` over an ordering that has no unique
 * tiebreaker — `search_events` sorts by `relevance desc, distance_km, starts_at`
 * and `listEvents` by `starts_at` alone. Rows that tie on every sort key have no
 * guaranteed order between two separate statements, so a row on the boundary can
 * come back in page 2 as well as page 1. In a `FlatList` that is a duplicate
 * `key`, which React answers with a warning and a list that renders the same
 * card twice.
 *
 * This is containment, not the fix. The fix is a `, id` tiebreaker on both
 * `order by` clauses, which belongs in a migration — see the handover.
 */
function dedupeById<T extends { id: string }>(pages: T[][] | undefined): T[] {
  if (pages === undefined) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    for (const item of page) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

/** "12 events" — announced when the list settles, so the count is not silent. */
function countLabel(count: number, noun: string, more: boolean): string {
  if (count === 0) return `No ${noun}s`;
  // "1 or more event" is not a sentence: the plural follows the phrase, not the
  // number, once "or more" is in front of it.
  const plural = count !== 1 || more;
  return `${count}${more ? ' or more' : ''} ${plural ? `${noun}s` : noun}`;
}

/**
 * The way into the filter sheet.
 *
 * Beside the search field rather than in the chip row below it. The chip row is
 * a horizontal scroller of categories — a control that lives in it scrolls out
 * of reach, and the count badge is the one thing on this screen that has to
 * stay visible, because it is the only signal that results are being narrowed.
 * A seeker who forgets a filter is on reads an empty list as an empty
 * marketplace.
 */
function FiltersButton({ count, onPress }: { count: number; onPress: () => void }) {
  const theme = useTheme();
  const active = count > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filtersButton,
        {
          backgroundColor: active
            ? theme.colors.accentSubtle
            : pressed
              ? theme.colors.surfaceSunken
              : theme.colors.surface,
          borderColor: active ? theme.colors.accent : theme.colors.borderStrong,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={active ? `Filters, ${count} applied` : 'Filters'}
      accessibilityHint="Opens price, format and distance filters"
    >
      <Ionicons
        name="options-outline"
        size={20}
        color={active ? theme.colors.accentText : theme.colors.textSecondary}
      />
      {active ? (
        <View style={[styles.filtersCount, { backgroundColor: theme.colors.accent }]}>
          <Text variant="caption" style={{ color: theme.colors.textOnAccent }}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  searchField: { flex: 1 },
  filtersButton: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersCount: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  // The chip row bleeds to both edges so it reads as scrollable; everything
  // above it keeps the standard screen gutter.
  headerInset: {
    paddingHorizontal: SCREEN_GUTTER,
    gap: spacing.sm,
  },
});
