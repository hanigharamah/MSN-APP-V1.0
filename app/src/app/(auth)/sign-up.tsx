import { Link, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { AuthShell } from '@/components/auth/AuthShell';
import { FormError } from '@/components/auth/FormError';
import { Button, Chip, Input, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { toAppError } from '@/lib/errors';
import {
  validateDisplayName,
  validateEmail,
  validatePassword,
  validatePasswordConfirmation,
} from '@/lib/validation';
import { MIN_TOUCH_TARGET, spacing, touchSlop } from '@/theme';
import type { AccountType } from '@/types/database';

/**
 * Account type is chosen at signup because it is the ONE moment the user can
 * set it: `guard_profile_trust_flags` makes `account_type` admin-only on every
 * subsequent update. It reaches the profile row through
 * `raw_user_meta_data.account_type`, which the `handle_new_user` trigger reads.
 *
 * `venue` and `nonprofit` are omitted from the picker deliberately — they need
 * verification steps that do not exist yet, and offering them here would create
 * accounts nobody can complete. They remain valid enum values for admins.
 */
const ACCOUNT_CHOICES: { value: AccountType; label: string; blurb: string }[] = [
  { value: 'seeker', label: "I'm looking", blurb: 'Find practitioners, book sessions, buy tickets' },
  { value: 'practitioner', label: 'I practise', blurb: 'Offer one-to-one sessions and events' },
  { value: 'business', label: "We're a business", blurb: 'A studio, clinic or wellness business' },
  { value: 'organizer', label: 'I run events', blurb: 'Workshops, retreats and gatherings' },
];

export default function SignUpScreen() {
  const router = useRouter();
  const { signUpWithPassword } = useAuth();

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('seeker');
  const [revealed, setRevealed] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  // `submitting` is state and lands a render later, so the keyboard's "go" and
  // a button press in the same tick can both pass the check. This ref cannot,
  // and a duplicate signup is not something to find out about afterwards.
  const inFlight = useRef(false);

  /**
   * Editing a field clears its error, and any form-level error with it.
   *
   * Validation runs on submit only — validating per keystroke would flag a
   * half-typed email. But leaving the message up while someone corrects the
   * field reads as broken. So: never validate on change, always clear on change.
   */
  function editField(field: string, value: string, set: (next: string) => void) {
    set(value);
    setFieldErrors((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setFormError(null);
  }

  async function submit() {
    if (inFlight.current) return;

    const errors: Record<string, string> = {};
    const nameError = validateDisplayName(displayName);
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const confirmError = validatePasswordConfirmation(password, confirmation);

    if (nameError) errors.displayName = nameError;
    if (emailError) errors.email = emailError;
    if (passwordError) errors.password = passwordError;
    if (confirmError) errors.confirmation = confirmError;

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    inFlight.current = true;
    setFormError(null);
    setSubmitting(true);
    try {
      const { needsConfirmation } = await signUpWithPassword({
        email,
        password,
        displayName,
        accountType,
      });

      if (needsConfirmation) {
        // Trimmed, because the next screen prints it back ("we sent a code to
        // ___") and a stray space there looks like the wrong address.
        router.push({
          pathname: '/(auth)/verify-otp',
          params: { email: email.trim(), intent: 'signup' },
        });
      }
      // Otherwise confirmation is off in the project and a session already
      // exists — the root guard moves us into (tabs) on its own.
    } catch (caught) {
      setFormError(toAppError(caught, 'create your account'));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="One account, whether you are looking for support or offering it."
      footer={
        <View style={styles.footerRow}>
          <Text variant="bodySmall" color="secondary">
            Already have an account?{' '}
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable accessibilityRole="link" style={styles.link}>
              <Text variant="bodySmall" color="accent">
                Sign in
              </Text>
            </Pressable>
          </Link>
        </View>
      }
    >
      <FormError error={formError} />

      <View>
        <Text variant="bodySmall" color="secondary" style={styles.groupLabel}>
          What brings you here?
        </Text>
        {/* Wraps rather than scrolls horizontally, for two reasons. A nested
            horizontal ScrollView does not inherit the shell's
            `keyboardShouldPersistTaps`, so the first tap on a chip while a
            field was focused was eaten by the keyboard dismiss. And there are
            only four short choices: scrolled off-screen, the last two were
            findable only by someone who guessed the row moved. */}
        <View style={styles.chips}>
          {ACCOUNT_CHOICES.map((choice) => (
            <Chip
              key={choice.value}
              label={choice.label}
              selected={accountType === choice.value}
              onPress={() => setAccountType(choice.value)}
              accessibilityHint={choice.blurb}
            />
          ))}
        </View>
        <Text variant="caption" color="muted" style={styles.blurb}>
          {ACCOUNT_CHOICES.find((choice) => choice.value === accountType)?.blurb}
        </Text>
      </View>

      <Input
        label="Your name"
        value={displayName}
        onChangeText={(value) => editField('displayName', value, setDisplayName)}
        error={fieldErrors.displayName}
        hint="This is what other people will see."
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => emailRef.current?.focus()}
        editable={!submitting}
        required
      />

      <Input
        ref={emailRef}
        label="Email"
        value={email}
        onChangeText={(value) => editField('email', value, setEmail)}
        error={fieldErrors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!submitting}
        required
      />

      <Input
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={(value) => editField('password', value, setPassword)}
        error={fieldErrors.password}
        hint="At least 8 characters."
        secureTextEntry={!revealed}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
        editable={!submitting}
        required
        trailing={
          <Pressable
            onPress={() => setRevealed((current) => !current)}
            hitSlop={touchSlop(24)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <Text variant="bodySmall" color="accent">
              {revealed ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        }
      />

      <Input
        ref={confirmRef}
        label="Confirm password"
        value={confirmation}
        onChangeText={(value) => editField('confirmation', value, setConfirmation)}
        error={fieldErrors.confirmation}
        secureTextEntry={!revealed}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        editable={!submitting}
        required
      />

      <Button
        label="Create account"
        onPress={() => void submit()}
        loading={submitting}
        fullWidth
      />

      <Text variant="caption" color="muted" align="center">
        By creating an account you agree to our Terms and Privacy Policy.
      </Text>
      {/* TODO(agent · legal): link Terms and Privacy to the real documents.
          Apple rejects builds where these are plain text rather than reachable. */}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  groupLabel: {
    marginBottom: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  blurb: {
    marginTop: spacing.xs,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  /** A real 44pt box. See the note in `sign-in.tsx` on why not `hitSlop`. */
  link: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
