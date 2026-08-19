import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';

export interface LogoMarkProps {
  /** Height in points. Width follows — the mark is square. */
  size?: number;
}

/**
 * The My Source Network symbol.
 *
 * ## Why the symbol and not the full lockup
 *
 * `Logo_Horizontal.png` — symbol plus "My Source Network / Connect · Heal ·
 * Transform" — is 6.5:1. At any height where the strapline is legible it is
 * roughly 200pt wide, which on a 402pt screen leaves no room for the centred
 * screen title and collides with it outright on a small phone. The symbol
 * carries the brand on its own and fits the corner it is asked to sit in.
 *
 * ## Not decorative
 *
 * It is marked `accessibilityRole="image"` with a label rather than hidden.
 * A screen reader user arriving on a screen benefits from knowing which app
 * they are in, and this is the only thing on the header that says so.
 *
 * Source is the brand asset from the existing web app, trimmed and squared —
 * not a redraw, so the two products cannot drift apart.
 */
export function LogoMark({ size = 28 }: LogoMarkProps) {
  return (
    <Image
      source={require('../../../assets/logo-mark.png')}
      style={[styles.mark, { width: size, height: size }]}
      contentFit="contain"
      accessibilityRole="image"
      accessibilityLabel="My Source Network"
    />
  );
}

const styles = StyleSheet.create({
  // Nudged in from the very edge: iOS nav-bar content sits on a 16pt gutter,
  // and a logo flush to the screen edge reads as a mistake.
  mark: { marginLeft: 4 },
});
