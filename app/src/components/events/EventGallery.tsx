import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/ui';
import type { EventImage } from '@/types/database';
import { radii, spacing, useTheme } from '@/theme';

const TILE = 132;

export interface EventGalleryProps {
  images: readonly EventImage[];
  /** Event title, so each tile announces what it is a photo of. */
  title: string;
}

/**
 * Horizontally scrolling photo strip from `event_images`, ordered by
 * `sort_order`.
 *
 * A `ScrollView` rather than a horizontal `FlatList`: galleries here are a
 * handful of tiles, and nesting a VirtualizedList inside the screen's
 * ScrollView trades a real warning for virtualisation nobody needs at this
 * size.
 */
export function EventGallery({ images, title }: EventGalleryProps) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {images.map((image, index) => (
        <Image
          key={image.id}
          source={{ uri: image.url }}
          style={[styles.tile, { backgroundColor: theme.colors.surfaceMuted }]}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          accessibilityRole="image"
          accessibilityLabel={`${title}, photo ${index + 1} of ${images.length}`}
        />
      ))}
    </ScrollView>
  );
}

/** Pending branch, sized to the real tiles so nothing jumps on load. */
export function EventGallerySkeleton() {
  return (
    <View style={styles.strip}>
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} width={TILE} height={TILE} radius="lg" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radii.lg,
  },
});
