import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { Avatar } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useMode } from '@/context/ModeContext';
import { avatarSizes, iconSizes, radii, useTheme } from '@/theme';

export interface ProfileTabIconProps {
  /** Tint the tab bar hands down, already resolved to active/inactive. */
  color: ColorValue;
  focused: boolean;
}

/**
 * The Profile tab's icon: your own face, ringed while you are hosting.
 *
 * ## Why a photo and not a glyph
 *
 * This tab is the switcher. Long-pressing it changes which half of the product
 * you are in, so the tab has to carry the answer to "which half am I in now?"
 * — and it has to carry it from every other tab, because that is where you are
 * standing when you wonder. A person-shaped glyph cannot hold state; a face
 * with a ring around it can.
 *
 * ## The ring
 *
 * Always lit; the COLOUR is the cue. Purple is hosting, green is seeking.
 *
 * An earlier pass lit it for hosting only and left seeking bare, on the theory
 * that seeking is the resting state and does not need announcing. That was
 * wrong in use: an unlit ring is indistinguishable from a plain avatar, so the
 * cue only existed half the time and the tab looked broken in the other half.
 * Two lit states read as deliberate where one lit and one absent reads as a
 * rendering bug.
 *
 * A seeker who cannot host still gets the green ring. They have nothing to
 * switch to, but the ring is not a switch — it is a statement of where you
 * are, and "seeking" is true for them permanently.
 *
 * Colour is doing the work alone here, which is a real limit at 24pt: someone
 * with a red/green or protan deficiency may not separate these two. The ring
 * is therefore never the ONLY route to the answer — Profile spells the mode
 * out in words, and the switcher sheet marks the current one with a tick.
 *
 * ## What the ring is not
 *
 * It is not focus. The label already turns accent-coloured when this tab is
 * selected, and a second ring for that would make the mode ring ambiguous the
 * moment you were standing on Profile. The outer box therefore keeps its size
 * whether or not the ring is lit, so the avatar does not shift when you switch.
 */
export function ProfileTabIcon({ color, focused }: ProfileTabIconProps) {
  const theme = useTheme();
  const { session, profile } = useAuth();
  const { mode, canHost } = useMode();

  // Signed out this tab reads "Log in" and there is no face to show. The glyph
  // is also the right affordance: nothing here is yours yet.
  if (session === null || profile === null) {
    return (
      <Ionicons
        name={focused ? 'person-circle' : 'person-circle-outline'}
        size={iconSizes.lg}
        color={color}
      />
    );
  }

  const hosting = canHost && mode === 'hosting';

  return (
    <View style={styles.box}>
      <Avatar
        uri={profile.avatar_url}
        name={profile.display_name}
        size="xs"
        ringed
        ringColor={hosting ? theme.colors.accent : theme.colors.success}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Four points wider than the avatar so the ring has somewhere to sit without
  // the photo resizing under it. Matches the optical weight of the 24pt glyphs
  // on the other three tabs.
  box: {
    width: avatarSizes.xs + 4,
    height: avatarSizes.xs + 4,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
