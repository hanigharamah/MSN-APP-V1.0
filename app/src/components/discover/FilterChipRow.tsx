import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip, Skeleton, Text } from '@/components/ui';
import { SCREEN_GUTTER, spacing } from '@/theme';

export interface FilterChipOption {
  id: string;
  name: string;
}

export interface FilterChipRowProps {
  options: readonly FilterChipOption[] | undefined;
  /** `undefined` means "All". */
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
  isPending: boolean;
  isError: boolean;
  /** Names the row for screen readers, e.g. "Filter by category". */
  accessibilityLabel: string;
  /** What the row filters, lower case — used in the "All" chip and hints. */
  noun: string;
}

/**
 * A horizontally scrolling, single-select filter row.
 *
 * Single-select rather than multi: `EventListFilters.categoryId` and
 * `ProviderSearchFilters.specialityId` are both scalars, so a multi-select row
 * would show the user a state the query layer cannot express.
 *
 * The web puts these behind a 44×44 filter button opening a full-height
 * offcanvas with ten accordions (`EventsListing.vue:1152`, ~870 duplicated
 * lines). That whole tree is the desktop sidebar rebuilt for mobile; the one
 * filter that carries most of the value is the category taxonomy, and on a
 * phone an always-visible scrolling row costs one tap instead of three.
 *
 * A failed load degrades to a quiet line rather than an `ErrorState`: filters
 * are an affordance over the results, not the results, and blocking a browsable
 * list because a taxonomy request failed is the wrong trade.
 */
export function FilterChipRow({
  options,
  selectedId,
  onSelect,
  isPending,
  isError,
  accessibilityLabel,
  noun,
}: FilterChipRowProps) {
  if (isPending) {
    return (
      <View
        style={styles.placeholderRow}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {[72, 96, 84].map((width) => (
          <Skeleton key={width} width={width} height={32} radius="lg" />
        ))}
      </View>
    );
  }

  if (isError || options === undefined || options.length === 0) {
    if (!isError) return null;
    return (
      <View style={styles.placeholderRow}>
        <Text variant="caption" color="muted">
          {`${noun} filters are unavailable right now.`}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.row}
      accessibilityLabel={accessibilityLabel}
    >
      <Chip
        label="All"
        selected={selectedId === undefined}
        onPress={() => onSelect(undefined)}
        accessibilityHint={`Shows every ${noun}`}
      />
      {options.map((option) => (
        <Chip
          key={option.id}
          label={option.name}
          selected={option.id === selectedId}
          onPress={() => onSelect(option.id === selectedId ? undefined : option.id)}
          accessibilityHint={`Filters results by ${option.name}`}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.xs,
    paddingHorizontal: SCREEN_GUTTER,
  },
  placeholderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: SCREEN_GUTTER,
    minHeight: 32,
  },
});
