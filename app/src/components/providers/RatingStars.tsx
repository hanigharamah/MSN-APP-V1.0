import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

export interface RatingStarsProps {
  /** 0–5. `null` when the provider has no visible reviews yet. */
  average: number | null;
  /** How many reviews the average is drawn from. */
  total: number;
  /** 14 for a compact row, 20 beside a name. */
  size?: 'sm' | 'md';
  /** Hides the numeric average and count, leaving just the stars. */
  starsOnly?: boolean;
  style?: StyleProp<ViewStyle>;
}

const STAR_SIZE = { sm: 14, md: 20 } as const;

/**
 * The five-star row.
 *
 * The web app ships four different golds and five star sizes across three
 * incompatible components (DESIGN_SOURCE §5). This is the one implementation:
 * `colors.rating` filled, `colors.ratingEmpty` for the track, half stars at the
 * nearest 0.5.
 *
 * Rendered as a single accessibility node — "4.8 out of 5, 12 reviews" — rather
 * than five unlabelled images.
 */
export function RatingStars({
  average,
  total,
  size = 'sm',
  starsOnly = false,
  style,
}: RatingStarsProps) {
  const theme = useTheme();
  const glyph = STAR_SIZE[size];

  if (average === null || total === 0) {
    return (
      <View style={[styles.row, style]} accessible accessibilityLabel="No reviews yet">
        <Ionicons name="star-outline" size={glyph} color={theme.colors.ratingEmpty} />
        <Text variant="bodySmall" color="muted">
          No reviews yet
        </Text>
      </View>
    );
  }

  // Nearest half star. Rounding down would make a 4.9 look like a 4.5.
  const rounded = Math.round(average * 2) / 2;
  const label = `${average.toFixed(1)} out of 5, ${total} ${total === 1 ? 'review' : 'reviews'}`;

  return (
    <View style={[styles.row, style]} accessible accessibilityLabel={label}>
      <View style={styles.stars} importantForAccessibility="no-hide-descendants">
        {Array.from({ length: 5 }, (_, index) => {
          const filled = rounded >= index + 1;
          const half = !filled && rounded >= index + 0.5;
          return (
            <Ionicons
              key={index}
              name={filled ? 'star' : half ? 'star-half' : 'star-outline'}
              size={glyph}
              color={filled || half ? theme.colors.rating : theme.colors.ratingEmpty}
            />
          );
        })}
      </View>

      {starsOnly ? null : (
        <Text variant="bodySmall" color="secondary">
          {average.toFixed(1)}
          <Text variant="bodySmall" color="muted">
            {`  (${total})`}
          </Text>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
});
