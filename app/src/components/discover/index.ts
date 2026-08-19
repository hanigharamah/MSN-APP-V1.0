/**
 * Discover — the marketplace's front door.
 *
 * Everything here composes the shared UI kit in `@/components/ui`; nothing in
 * this folder is a second implementation of a primitive. `src/app/(tabs)/index.tsx`
 * is the only consumer.
 */
export { DiscoverList } from './DiscoverList';
export type { DiscoverListProps } from './DiscoverList';

export { EventCard } from './EventCard';
export type { EventCardProps } from './EventCard';

export { FilterChipRow } from './FilterChipRow';
export type { FilterChipOption, FilterChipRowProps } from './FilterChipRow';

export { PractitionerCard } from './PractitionerCard';
export type { PractitionerCardProps } from './PractitionerCard';

export { Rating, ratingLabel } from './Rating';
export type { RatingProps } from './Rating';

export { SearchField } from './SearchField';
export type { SearchFieldProps } from './SearchField';

export { SegmentedControl } from './SegmentedControl';
export type { SegmentedControlProps, SegmentedOption } from './SegmentedControl';

export {
  fromEventRow,
  fromEventSearchResult,
  isRetreatSlug,
  locationLabel,
  retreatCategoryIds,
} from './event-model';
export type { DiscoverEvent } from './event-model';

export { useDebouncedValue } from './use-debounced-value';

export {
  EventFiltersSheet,
  EMPTY_FILTERS,
  PRICE_BANDS,
  DELIVERY_OPTIONS,
  activeFilterCount,
} from './EventFiltersSheet';
export type { EventFilterState, EventFiltersSheetProps, PriceBand } from './EventFiltersSheet';

export { useNearMe, NEAR_ME_RADIUS_KM } from './use-near-me';
export type { NearMe, NearMeStatus } from './use-near-me';
