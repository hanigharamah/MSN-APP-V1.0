import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthShell } from '@/components/auth/AuthShell';
import { FormError } from '@/components/auth/FormError';
import { Button, Input, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { toAppError } from '@/lib/errors';
import { validateEmail } from '@/lib/validation';
import { iconSizes, MIN_TOUCH_TARGET, spacing, useTheme } from '@/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  // `submitting` is state and lands a render later; the keyboard's "go" and a
  // button press in the same tick would both get through. This ref will not —
  // and a doubled request here burns the project's email send allowance.
  const inFlight = useRef(false);

  async function submit() {
    if (inFlight.current) return;

    const emailError = validateEmail(email);
    setFieldError(emailError ?? undefined);
    if (emailError) return;

    inFlight.current = true;
    setFormError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      // Always shows success. `requestPasswordReset` swallows "no such user"
      // on purpose — telling the difference would let anyone check which
      // emails have accounts here.
      setSent(true);
    } catch (caught) {
      setFormError(toAppError(caught, 'send that email'));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  /** Deep links land here with no history, where `back()` is a dead button. */
  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/sign-in');
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={`If an account exists for ${email.trim()}, we have sent a link to reset your password.`}
      >
        <View style={[styles.iconWell, { backgroundColor: theme.colors.accentSubtle }]}>
          <Ionicons name="mail-outline" size={iconSizes.xl} color={theme.colors.accent} />
        </View>

        <Text variant="bodySmall" color="muted" align="center">
          The link opens the app and takes you straight to setting a new password. It expires in one
          hour.
        </Text>

        <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} fullWidth />

        <Pressable
          onPress={() => {
            setSent(false);
            setFormError(null);
            setFieldError(undefined);
          }}
          accessibilityRole="button"
          style={styles.link}
        >
          <Text variant="bodySmall" color="accent">
            Use a different email
          </Text>
        </Pressable>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email you signed up with and we will send you a reset link."
      footer={
        <Pressable onPress={leave} accessibilityRole="button" style={styles.link}>
          <Text variant="bodySmall" color="accent">
            Back to sign in
          </Text>
        </Pressable>
      }
    >
      <FormError error={formError} />

      <Input
        label="Email"
        value={email}
        onChangeText={(value) => {
          // Clear on edit, never validate on edit — see sign-in for why.
          setEmail(value);
          setFieldError(undefined);
          setFormError(null);
        }}
        error={fieldError}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        autoCorrect={false}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        editable={!submitting}
        required
      />

      <Button label="Send reset link" onPress={() => void submit()} loading={submitting} fullWidth />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  iconWell: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  /**
   * A real 44pt box rather than `hitSlop`. Slop here overlapped the "Back to
   * sign in" button above it — 12pt each way across a 16pt gap — so a tap just
   * under the button was ambiguous. See `sign-in.tsx` for the full note.
   */
  link: {
    alignSelf: 'center',
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
});
