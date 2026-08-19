import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { useMode } from '@/context/ModeContext';
import { iconSizes, radii, SCREEN_GUTTER, spacing, useTheme } from '@/theme';

/**
 * How long the bubble stays up before it withdraws on its own.
 *
 * Six seconds, not four: this is teaching a GESTURE, so the read has to be
 * long enough to notice the bubble, read it, and then press and hold — and the
 * hold itself is half a second before anything happens. It only ever appears
 * three times, so erring long costs very little.
 */
const DWELL_MS = 6000;

/**
 * "Hold to switch" — the coach mark for the Profile tab's long press.
 *
 * ## Why this exists at all
 *
 * A long press is invisible. Airbnb's own switcher is a hold on the tab bar,
 * and the evidence that it does not announce itself is a help centre article
 * and a run of community threads asking where the toggle went. Rather than
 * copy the gesture and inherit the problem, this points at it — three times,
 * then never again.
 *
 * ## Where it sits
 *
 * Just above the tab bar, over whatever screen you are on, anchored to the end
 * the Profile tab is on. A coach mark that floats in the middle of the screen
 * makes you hunt for what it is talking about; this one is next to the thing.
 *
 * ## Why it is not a modal
 *
 * It never takes the touch. `pointerEvents="box-none"` on the wrapper means
 * every tap that is not on the bubble itself passes through to the app
 * underneath — you can ignore it entirely and carry on, which is the only
 * polite thing for something you did not ask for. Tapping it dismisses it.
 */
export function ModeHintBubble() {
  const theme = useTheme();
  const { hintVisible, mode, dismissHint } = useMode();

  // Withdraws on its own. Re-armed whenever it is raised again, so a second
  // showing gets a full dwell rather than the tail of the first one's timer.
  useEffect(() => {
    if (!hintVisible) return;
    const timer = setTimeout(dismissHint, DWELL_MS);
    return () => clearTimeout(timer);
  }, [hintVisible, dismissHint]);

  if (!hintVisible) return null;

  // Names the destination, not the mechanism. "Hold to switch" leaves you
  // guessing what you would be switching to.
  const target = mode === 'hosting' ? 'seeking' : 'hosting';

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Pressable
        onPress={dismissHint}
        accessibilityRole="button"
        accessibilityLabel={`Hold the Profile tab to switch to ${target}. Tap to dismiss.`}
        accessibilityHint="Dismisses this tip"
        style={({ pressed }) => [
          styles.bubble,
          {
            backgroundColor: theme.colors.accentDeep,
            opacity: pressed ? theme.opacities.pressed : 1,
          },
        ]}
      >
        <Ionicons name="finger-print" size={iconSizes.md} color={theme.colors.textOnAccent} />
        <Text variant="bodySmall" style={{ color: theme.colors.textOnAccent }}>
          Hold to switch to {target}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // No safe-area inset here: this renders inside the tab screen, whose bottom
  // edge is already the top of the tab bar. Adding the inset again pushed the
  // bubble a whole tab bar's height too high, marooned in the middle of the
  // settings list instead of next to the tab it points at.
  wrapper: {
    position: 'absolute',
    left: SCREEN_GUTTER,
    right: SCREEN_GUTTER,
    bottom: spacing.sm,
    alignItems: 'flex-end',
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
  },
});
