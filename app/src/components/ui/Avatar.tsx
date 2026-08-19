import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { avatarSizes, radii, useTheme } from '@/theme';
import { initialsOf } from '@/lib/format';
import { Text } from './Text';
import type { TextStyleToken } from '@/theme';

/** Diameters from `avatarSizes` — the `w_N h_N` pairs the web app emits. */
export type AvatarSize = keyof typeof avatarSizes;

const TEXT_VARIANT: Record<AvatarSize, TextStyleToken> = {
  xs: 'label',
  sm: 'label',
  md: 'bodySmall',
  lg: 'bodyStrong',
  xl: 'h3',
  xxl: 'h1',
  xxxl: 'display',
};

export interface AvatarProps {
  /** `profiles.avatar_url`. Null falls back to initials. */
  uri?: string | null;
  /** `profiles.display_name`. Used for initials and the accessible label. */
  name: string;
  size?: AvatarSize;
  /** Ring in the accent colour — for live, selected or verified states. */
  ringed?: boolean;
  /**
   * Overrides the ring colour. Only read when `ringed` is true.
   *
   * The default accent is right for "selected" and "verified"; a caller that
   * rings for a different reason — app mode, say — passes its own so the ring
   * is not mistaken for one of those.
   */
  ringColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Profile image with an initials fallback.
 *
 * Labelled with the person's name so a screen reader in a list of
 * practitioners does not announce an unlabelled image. When the avatar sits
 * beside a visible name, fold both into the parent's accessible label and set
 * `accessibilityElementsHidden` on the container instead — otherwise the name
 * is read twice.
 */
export function Avatar({
  uri,
  name,
  size = 'md',
  ringed = false,
  ringColor,
  style,
}: AvatarProps) {
  const theme = useTheme();
  const dimension = avatarSizes[size];

  const container: ViewStyle = {
    width: dimension,
    height: dimension,
    borderRadius: radii.full,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: ringed ? theme.borderWidths.thick : 0,
    borderColor: ringColor ?? theme.colors.accent,
  };

  return (
    <View
      style={[styles.container, container, style]}
      accessibilityRole="image"
      accessibilityLabel={name}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          // Avatars are the most-reused image in the app; caching to disk makes
          // a scrolled-back list instant.
          cachePolicy="memory-disk"
          transition={150}
        />
      ) : (
        <Text variant={TEXT_VARIANT[size]} color="muted">
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
