import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { radii, useTheme } from '@/theme';

const HERO_HEIGHT = 200;

export interface EventHeroProps {
  /** `events.cover_url`. Null falls back to a themed placeholder. */
  uri: string | null;
  /** Event title, for the image's accessible label. */
  title: string;
}

/**
 * The cover image.
 *
 * 200pt tall at radius 6, matching the web detail page's mobile hero
 * (`TempEventDetail.vue:11-58`). The web's `images/event_default.webp` fallback
 * is a web asset, so a missing cover renders a themed well with the same
 * calendar glyph the rest of the app uses for events rather than a broken
 * image box.
 */
export function EventHero({ uri, title }: EventHeroProps) {
  const theme = useTheme();

  if (!uri) {
    return (
      <View
        style={[
          styles.hero,
          styles.placeholder,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
            borderWidth: theme.borderWidths.hairline,
          },
        ]}
        accessibilityRole="image"
        accessibilityLabel={`${title}. No cover image.`}
      >
        <Ionicons name="calendar-outline" size={40} color={theme.colors.textMuted} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.hero, { backgroundColor: theme.colors.surfaceMuted }]}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={200}
      accessibilityRole="image"
      accessibilityLabel={`Cover image for ${title}`}
    />
  );
}

const styles = StyleSheet.create({
  hero: {
    width: '100%',
    height: HERO_HEIGHT,
    borderRadius: radii.md,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
