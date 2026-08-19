import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { iconSizes, spacing, useTheme } from '@/theme';

const STARS = [0, 1, 2, 3, 4] as const;

export interface RatingProps {
  /** `null` when the provider has no visible reviews. */
  average: number | null;
  total: number;
}

/**
 * Five stars plus the numeric average.
 *
 * DESIGN_SOURCE §5 counts four different golds shipping simultaneously in the
 * web app (`#FFD055`, `#FFC107`, `#FFCC4D`, `#F5D812`) across three unrelated
 * star implementations. The theme resolves that to one `rating` token with
 * `ratingEmpty` behind it, and this is the only place Discover draws a star.
 *
 * Purely decorative to assistive tech — the surrounding card composes the
 * rating into its own label, so five unlabelled glyphs would be five wasted
 * stops.
 */
export function Rating({ average, total }: RatingProps) {
  const theme = useTheme();

  if (average === null || total === 0) {
    return (
      <Text variant="caption" color="muted">
        No reviews yet
      </Text>
    );
  }

  return (
    <View
      style={styles.row}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {STARS.map((index) => {
        const remaining = average - index;
        const name = remaining >= 0.75 ? 'star' : remaining >= 0.25 ? 'star-half' : 'star-outline';

        return (
          <Ionicons
            key={index}
            name={name}
            size={iconSizes.xs}
            color={remaining >= 0.25 ? theme.colors.rating : theme.colors.ratingEmpty}
          />
        );
      })}

      <Text variant="caption" color="secondary">
        {`${average.toFixed(1)} (${total})`}
      </Text>
    </View>
  );
}

/** The same information as a sentence, for a parent's accessibility label. */
export function ratingLabel(average: number | null, total: number): string {
  if (average === null || total === 0) return 'No reviews yet';
  return `Rated ${average.toFixed(1)} out of 5, from ${total} ${total === 1 ? 'review' : 'reviews'}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs / 2,
  },
});
