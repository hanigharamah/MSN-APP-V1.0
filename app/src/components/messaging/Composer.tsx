import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { borderWidths, iconSizes, radii, spacing, textStyles, useTheme } from '@/theme';

export interface ComposerProps {
  value: string;
  onChangeText: (next: string) => void;
  onSend: () => void;
  /** Send is in flight — blocks a double tap without moving anything. */
  sending?: boolean;
  /**
   * Sending is not possible yet — a block check still in flight, say. The field
   * stays usable so a draft is not lost; only the action is held back.
   */
  disabled?: boolean;
  placeholder?: string;
}

const MAX_HEIGHT = 120;

/**
 * True while the software keyboard is up.
 *
 * The composer sits inside a `KeyboardAvoidingView`, which pads the whole stack
 * up by the keyboard's height — and the keyboard already covers the home
 * indicator. Adding `insets.bottom` on top of that leaves a 34pt band of empty
 * surface between the field and the keys on any device with a gesture bar.
 * The inset is only right when the keyboard is down.
 */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // `will*` fires with the animation on iOS so the inset collapses in step
    // with the lift; Android only emits `did*`.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const listeners = [
      Keyboard.addListener(showEvent, () => setVisible(true)),
      Keyboard.addListener(hideEvent, () => setVisible(false)),
    ];
    return () => {
      for (const listener of listeners) listener.remove();
    };
  }, []);

  return visible;
}

/**
 * The message input, pinned above the keyboard.
 *
 * Deliberately not the `Input` primitive: `Input` is a labelled form field with
 * a hint slot and a fixed 46pt height, and a composer is a different control —
 * it grows to four-ish lines, has no visible label, and its action lives inside
 * the field. Composing the two would mean fighting `Input`'s layout, which is
 * the point at which a design system starts to bend.
 *
 * `blurOnSubmit={false}` with `multiline` keeps the keyboard up between
 * messages, which is what people expect from a chat and what makes a reply feel
 * like a reply rather than a form submission.
 */
export function Composer({
  value,
  onChangeText,
  onSend,
  sending = false,
  disabled = false,
  placeholder = 'Message',
}: ComposerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();

  const canSend = value.trim().length > 0 && !sending && !disabled;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surfaceElevated,
          borderTopColor: theme.colors.border,
          borderTopWidth: borderWidths.hairline,
          paddingBottom: (keyboardVisible ? 0 : insets.bottom) + spacing.xs,
        },
      ]}
    >
      <View
        style={[
          styles.field,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.borderStrong,
            borderWidth: borderWidths.hairline,
            borderRadius: radii.xxl,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textPlaceholder}
          multiline
          blurOnSubmit={false}
          accessibilityLabel="Message"
          style={[styles.input, textStyles.body, { color: theme.colors.textPrimary }]}
        />
      </View>

      <Pressable
        onPress={onSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        accessibilityState={{ disabled: !canSend, busy: sending }}
        style={({ pressed }) => [
          styles.send,
          {
            backgroundColor: canSend
              ? pressed
                ? theme.colors.accentPressed
                : theme.colors.accent
              : theme.colors.disabled,
          },
        ]}
      >
        <Ionicons
          name="arrow-up"
          size={iconSizes.md}
          color={canSend ? theme.colors.textOnAccent : theme.colors.disabledText}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  field: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    maxHeight: MAX_HEIGHT,
    paddingHorizontal: spacing.sm,
  },
  input: {
    maxHeight: MAX_HEIGHT - spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  // 44 keeps the send target at the accessible minimum even though the glyph
  // inside it is 20.
  send: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
