import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthShell } from '@/components/auth/AuthShell';
import { FormError } from '@/components/auth/FormError';
import { Button, Input, Text } from '@/components/ui';
import { useAuth, type OtpType } from '@/context/AuthContext';
import { toAppError } from '@/lib/errors';
import { OTP_LENGTH, validateOtp } from '@/lib/validation';
import { MIN_TOUCH_TARGET, spacing } from '@/theme';

/** Supabase rate-limits OTP sends; a shorter cooldown just produces errors. */
const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyOtpScreen() {
  const router = useRouter();
  const { verifyOtp, signInWithOtp } = useAuth();

  const params = useLocalSearchParams<{ email?: string; intent?: string }>();
  const email = params.email ?? '';
  // `signup` verifies a new account; `signin` verifies a passwordless login.
  // Supabase treats these as different OTP types and rejects the wrong one.
  const otpType: OtpType = params.intent === 'signup' ? 'signup' : 'email';

  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const submittedFor = useRef<string | null>(null);
  // `submitting` is state, so it is not visible to a second call made in the
  // same tick — the button and a return-key submit can both get through before
  // React re-renders. This ref closes that window.
  const inFlight = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submit = useCallback(
    async (value: string) => {
      if (inFlight.current) return;

      const codeError = validateOtp(value);
      setFieldError(codeError ?? undefined);
      if (codeError) return;

      inFlight.current = true;
      setFormError(null);
      setSubmitting(true);
      try {
        await verifyOtp(email, value, otpType);
        // A verified OTP produces a session; the root guard routes into (tabs).
      } catch (caught) {
        setFormError(toAppError(caught, 'verify that code'));
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [email, otpType, verifyOtp],
  );

  /**
   * Auto-submits as soon as six digits are present, so the common path is
   * paste-and-done.
   *
   * `submittedFor` records the code this screen has already sent and is NOT
   * cleared when verification fails. Clearing it on failure — which is the
   * obvious-looking thing to do, so that "they can retry the same digits" —
   * turns this effect into an infinite loop: the failure sets `submitting` back
   * to false, the effect re-runs, the guard is empty, it submits the same dead
   * code again, and the screen hammers `/auth/v1/verify` until Supabase rate
   * limits the project. Retrying the same digits is still possible; it is what
   * the Verify button does, and that path deliberately bypasses this guard.
   */
  useEffect(() => {
    if (code.length !== OTP_LENGTH || submitting) return;
    if (submittedFor.current === code) return;
    submittedFor.current = code;
    void submit(code);
  }, [code, submitting, submit]);

  async function resend() {
    if (inFlight.current) return;

    inFlight.current = true;
    setFormError(null);
    setFieldError(undefined);
    setResending(true);
    try {
      await signInWithOtp(email, { shouldCreateUser: otpType === 'signup' });
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setCode('');
      // A new code is on its way, so the digits typed for the old one should
      // auto-submit again if they happen to repeat.
      submittedFor.current = null;
    } catch (caught) {
      setFormError(toAppError(caught, 'resend that code'));
    } finally {
      inFlight.current = false;
      setResending(false);
    }
  }

  /** Deep links land here with no history, where `back()` is a dead button. */
  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/sign-in');
  }

  if (!email) {
    // Reached by a deep link or a back-navigation that lost the param.
    return (
      <AuthShell
        title="Something went missing"
        subtitle="We do not know which email to verify. Start again from sign in."
      >
        <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} fullWidth />
      </AuthShell>
    );
  }

  const busy = submitting || resending;

  return (
    <AuthShell
      title="Enter your code"
      subtitle={`We sent a ${OTP_LENGTH}-digit code to ${email}. It expires in one hour.`}
      footer={
        <Pressable onPress={leave} accessibilityRole="button" style={styles.link}>
          <Text variant="bodySmall" color="accent">
            Use a different email
          </Text>
        </Pressable>
      }
    >
      <FormError error={formError} />

      <Input
        label="Verification code"
        value={code}
        onChangeText={(next) => {
          setCode(next.replace(/\D/g, '').slice(0, OTP_LENGTH));
          // Clear on edit, never validate on edit — the same contract the other
          // auth screens keep. A "the code is 6 digits" message left standing
          // over freshly typed digits reads as a failure that already happened.
          setFieldError(undefined);
          setFormError(null);
        }}
        error={fieldError}
        keyboardType="number-pad"
        // Lets iOS and Android offer the code straight from the SMS/email
        // notification, which is the whole reason OTP is bearable.
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH}
        autoFocus
        editable={!busy}
        inputStyle={styles.code}
        required
      />

      <Button
        label="Verify"
        onPress={() => void submit(code)}
        loading={submitting}
        disabled={code.length !== OTP_LENGTH || resending}
        fullWidth
      />

      <View style={styles.resend}>
        {cooldown > 0 ? (
          <Text variant="bodySmall" color="muted">
            Resend available in {cooldown}s
          </Text>
        ) : (
          <Pressable
            onPress={() => void resend()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy: resending }}
            style={styles.link}
          >
            <Text variant="bodySmall" color={busy ? 'muted' : 'accent'}>
              {resending ? 'Sending…' : 'Send a new code'}
            </Text>
          </Pressable>
        )}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  code: {
    letterSpacing: 8,
    textAlign: 'center',
  },
  resend: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  /**
   * A real 44pt box rather than `hitSlop`. Slop on stacked text links overlaps
   * — two 20pt links 12pt apart each claim 12pt of that gap — and the tap in
   * between goes to whichever the tree happens to hit first.
   */
  link: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
