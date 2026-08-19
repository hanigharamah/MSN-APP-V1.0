import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { radii, spacing, useTheme, type RadiusToken } from '@/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: RadiusToken;
  style?: StyleProp<ViewStyle>;
}

/**
 * A pulsing placeholder block.
 *
 * Hidden from assistive tech entirely — a screen reader announcing six
 * unlabelled boxes is worse than silence. The screen's loading state should be
 * announced once by its container (see `Screen`'s `accessibilityLiveRegion`
 * usage in the tab screens), not by each shape.
 *
 * Skeletons are for content whose SHAPE is known: a list of cards, a profile
 * header. For an action in flight use the spinner in `Button`; for an unknown
 * shape use a plain `ActivityIndicator`.
 */
export function Skeleton({ width = '100%', height = 16, radius = 'sm', style }: SkeletonProps) {
  const theme = useTheme();
  const progress = useSharedValue(0.5);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radii[radius], backgroundColor: theme.colors.skeleton },
        animatedStyle,
        style,
      ]}
    />
  );
}

export interface SkeletonListProps {
  /** How many placeholder rows. Match the real list's typical length. */
  count?: number;
  /** Height of each row. Match the real row so nothing jumps on load. */
  itemHeight?: number;
}

/**
 * A list of card-shaped skeletons. Use this as the `isPending` branch of any
 * list screen so the layout does not shift when data arrives.
 */
export function SkeletonList({ count = 5, itemHeight = 96 }: SkeletonListProps) {
  return (
    <View
      style={styles.list}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} height={itemHeight} radius="lg" />
      ))}
    </View>
  );
}

/** Two lines of text, the second shorter — the shape real copy tends to take. */
export function SkeletonText({ lines = 2 }: { lines?: number }) {
  return (
    <View
      style={styles.text}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} height={12} width={index === lines - 1 ? '60%' : '100%'} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  text: {
    gap: spacing.xs,
  },
});
