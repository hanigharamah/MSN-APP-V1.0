import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { layout, spacing, useTheme } from '@/theme';

export interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Pinned to the bottom — the "no account? sign up" line. */
  footer?: ReactNode;
}

/**
 * Shared frame for the auth screens.
 *
 * Handles the two things every auth screen gets wrong:
 *
 * 1. **Keyboard.** `KeyboardAvoidingView` with `padding` on iOS and `height`
 *    on Android — the platforms genuinely need different behaviours, and using
 *    one for both leaves the submit button under the keyboard on the other.
 * 2. **Taps outside the field.** `keyboardShouldPersistTaps="handled"` so
 *    tapping the submit button while a field is focused fires the button
 *    rather than being swallowed by the dismiss.
 */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          <Text variant="h1" color="heading" heading={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" color="secondary" style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}

          <View style={styles.form}>{children}</View>
        </View>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
    justifyContent: 'space-between',
  },
  inner: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
  },
  subtitle: {
    marginTop: spacing.xs,
  },
  form: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  footer: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
});
