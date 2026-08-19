import { Link, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { AuthShell } from '@/components/auth/AuthShell';
import { FormError } from '@/components/auth/FormError';
import { Button, Input, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { toAppError } from '@/lib/errors';
import { validateEmail, validatePassword } from '@/lib/validation';
import { MIN_TOUCH_TARGET, spacing, touchSlop } from '@/theme';

type Mode = 'password' | 'otp';

export default function SignInScreen() {
  const router = useRouter();
  const { signInWithPassword, signInWithOtp } = useAuth();
  const passwordRef = useRef<TextInput>(null);

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  // `submitting` is state and lands a render later, so a keyboard "go" and a
  // button press in the same tick can both pass the check. This ref cannot.
  const inFlight = useRef(false);

  /**
   * Editing a field clears its error, and any form-level error with it.
   *
   * Validation only runs on submit — re-validating on every keystroke shows
   * "that does not look like an email address" while someone is halfway
   * through typing one. But leaving the message up while they actively correct
   * the field reads as broken, and a stale "incorrect password" banner over a
   * freshly typed password is worse: it looks like the retry already failed.
   *
   * So: never validate on change, always clear on change.
   */
  function editField(field: 'email' | 'password', value: string) {
    if (field === 'email') setEmail(value);
    else setPassword(value);

    setFieldErrors((prev) => (prev[field] === undefined ? prev : { ...prev, [field]: undefined }));
    setFormError(null);
  }

  async function submit() {
    if (inFlight.current) return;

    const emailError = validateEmail(email);
    const passwordError = mode === 'password' ? validatePassword(password) : null;

    setFieldErrors({
      ...(emailError ? { email: emailError } : {}),
      ...(passwordError ? { password: passwordError } : {}),
    });
    if (emailError || passwordError) return;

    inFlight.current = true;
    setFormError(null);
    setSubmitting(true);
    try {
      if (mode === 'password') {
        await signInWithPassword(email, password);
        // The root layout's guard redirects into (tabs) once the session lands.
      } else {
        // `shouldCreateUser: false` — this is the SIGN IN screen. Creating an
        // account from a typo'd email here would be a silent surprise.
        await signInWithOtp(email, { shouldCreateUser: false });
        // Trimmed, because the next screen prints it back ("we sent a code to
        // ___") and a stray space there looks like the wrong address.
        router.push({
          pathname: '/(auth)/verify-otp',
          params: { email: email.trim(), intent: 'signin' },
        });
      }
    } catch (caught) {
      setFormError(toAppError(caught, 'sign in'));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to book sessions, message practitioners and manage your tickets."
      footer={
        <View style={styles.footerRow}>
          <Text variant="bodySmall" color="secondary">
            New to My Source Network?{' '}
          </Text>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable accessibilityRole="link" style={styles.link}>
              <Text variant="bodySmall" color="accent">
                Create an account
              </Text>
            </Pressable>
          </Link>
        </View>
      }
    >
      <FormError error={formError} />

      <Input
        label="Email"
        value={email}
        onChangeText={(value) => editField('email', value)}
        error={fieldErrors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        autoCorrect={false}
        returnKeyType={mode === 'password' ? 'next' : 'go'}
        onSubmitEditing={() => (mode === 'password' ? passwordRef.current?.focus() : void submit())}
        editable={!submitting}
        required
      />

      {mode === 'password' ? (
        <Input
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={(value) => editField('password', value)}
          error={fieldErrors.password}
          secureTextEntry={!revealed}
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          editable={!submitting}
          required
          trailing={
            <Pressable
              onPress={() => setRevealed((current) => !current)}
              hitSlop={touchSlop(24)}
              accessibilityRole="button"
              accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
              accessibilityState={{ selected: revealed }}
            >
              <Text variant="bodySmall" color="accent">
                {revealed ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          }
        />
      ) : (
        <Text variant="bodySmall" color="muted">
          We will email you a 6-digit code. No password needed.
        </Text>
      )}

      <Button
        label={mode === 'password' ? 'Sign in' : 'Email me a code'}
        onPress={() => void submit()}
        loading={submitting}
        fullWidth
      />

      <View style={styles.links}>
        <Pressable
          onPress={() => {
            setMode((current) => (current === 'password' ? 'otp' : 'password'));
            setFieldErrors({});
            setFormError(null);
          }}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting }}
          style={styles.link}
        >
          <Text variant="bodySmall" color={submitting ? 'muted' : 'accent'}>
            {mode === 'password' ? 'Sign in with a code instead' : 'Use my password instead'}
          </Text>
        </Pressable>

        {mode === 'password' ? (
          <Link href="/(auth)/forgot-password" asChild>
            <Pressable accessibilityRole="link" style={styles.link}>
              <Text variant="bodySmall" color="secondary">
                Forgot password?
              </Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  links: {
    marginTop: spacing.xs,
    alignItems: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  /**
   * Text links get a real 44pt box rather than `hitSlop`.
   *
   * Slop does not stack safely: these two links sat 12pt apart with 12pt of
   * slop each, so both claimed the whole gap and a tap in between landed on
   * whichever the tree matched first. A laid-out box cannot overlap its
   * neighbour, and it guarantees the target size instead of approximating it.
   */
  link: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
