import { useQueryClient } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { AppError, fromAuthError, toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { AccountType, Profile } from '@/types/database';

/**
 * =============================================================================
 * Auth
 * =============================================================================
 *
 * Owns three things and keeps them in step:
 *
 *   `session`  — the Supabase session. Source of truth for "signed in".
 *   `profile`  — the `profiles` row for the signed-in user. Source of truth for
 *                "who they are" (display name, account type, verification).
 *   `initialising` — true until the persisted session has been read off disk.
 *
 * That third one is the one people get wrong. On a cold start, `session` is
 * `null` for a few hundred milliseconds while `expo-secure-store` is read. A
 * route guard that treats `null` as "signed out" will bounce an authenticated
 * user to the sign-in screen every single launch. Nothing routes until
 * `initialising` is false.
 *
 * ## Profile creation
 *
 * There is no "create profile" call here on purpose. The `on_auth_user_created`
 * trigger inserts the `profiles` row when the auth user is created, taking
 * `display_name` and `account_type` from `raw_user_meta_data`. That is why
 * `signUp` passes them in `options.data` — the trigger reads them, and a client
 * insert would race it.
 */

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  /** The signed-in user's `profiles` row. Null while loading or signed out. */
  profile: Profile | null;

  /** True until the persisted session has been restored. Gate routing on this. */
  initialising: boolean;
  /** True while the profile row is being fetched or refetched. */
  profileLoading: boolean;
  /** Set when the profile fetch failed. The session is still valid. */
  profileError: AppError | null;

  /** Convenience — `session !== null`. */
  isAuthenticated: boolean;

  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (input: SignUpInput) => Promise<SignUpResult>;
  /** Sends a 6-digit code by email. Creates the account if it does not exist. */
  signInWithOtp: (email: string, options?: { shouldCreateUser?: boolean }) => Promise<void>;
  /** Verifies a code from `signInWithOtp` or from a signup confirmation. */
  verifyOtp: (email: string, token: string, type?: OtpType) => Promise<void>;
  /** Sends a password-reset email. Always resolves — see the note below. */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Sets a new password for the signed-in user. */
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Refetches the profile row. Call after editing it outside this context. */
  refreshProfile: () => Promise<void>;
}

export type OtpType = 'email' | 'signup' | 'recovery' | 'email_change';

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  accountType?: AccountType;
}

export interface SignUpResult {
  /**
   * True when the project requires email confirmation, so no session was
   * returned and the user must enter the code sent to them. Route to
   * `/(auth)/verify-otp` when this is true.
   */
  needsConfirmation: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // `AuthProvider` is mounted inside `QueryClientProvider` (see app/_layout),
  // so the cache can be dropped from the auth boundary itself.
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initialising, setInitialising] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<AppError | null>(null);

  // Guards against a slow profile fetch for a previous user resolving after a
  // fast one for the current user — otherwise signing out and back in as
  // someone else can leave the wrong name on screen.
  const activeUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    activeUserId.current = userId;
    setProfileLoading(true);
    setProfileError(null);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (activeUserId.current !== userId) return; // superseded

      if (error) {
        setProfileError(toAppError(error, 'load your profile'));
        return;
      }
      setProfile(data);
    } catch (caught) {
      if (activeUserId.current !== userId) return;
      setProfileError(toAppError(caught, 'load your profile'));
    } finally {
      if (activeUserId.current === userId) setProfileLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    // `getSession()` reads the persisted session off SecureStore. Until it
    // resolves we know nothing, which is what `initialising` represents.
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      // Deferred for the same reason as the listener below, and it took a
      // second sighting to believe it: `getSession()` does not merely read, it
      // REFRESHES an expired token, and the lock is still held while this
      // `.then` runs. A `.from()` issued here waits on that lock and times out
      // as a fetch error — "Could not load your profile" on a cold start after
      // the app has sat idle long enough for the token to expire, which is why
      // it never showed up in quick testing.
      if (data.session) {
        const userId = data.session.user.id;
        setTimeout(() => {
          if (cancelled) return;
          void loadProfile(userId);
        }, 0);
      }
      setInitialising(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return;

      setSession(nextSession);

      if (event === 'SIGNED_OUT' || nextSession === null) {
        activeUserId.current = null;
        setProfile(null);
        setProfileError(null);
        // Nothing cached belongs to the next person to hold this device.
        //
        // This is the ONLY place the cache is guaranteed to be dropped. The
        // Sign out button also calls `clear()`, but from its success handler —
        // so a sign-out that threw left user A's conversation list, message
        // previews and booking rows sitting in the cache under keys that are
        // not scoped to a user id. A server-side revocation or an expired
        // refresh token never reached that handler at all: it arrives here, as
        // an event, with no button press behind it.
        //
        // The deeper fix is to put the viewer id INTO the keys, so a stale
        // entry could never be read by the wrong account even if it survived.
        // That is a wider refactor of `lib/queries/keys.ts` and every call
        // site; this closes the hole in the meantime and stays correct
        // afterwards.
        queryClient.clear();
        return;
      }

      // TOKEN_REFRESHED fires on a timer with the same user — refetching the
      // profile there would put a network request on a background timer for no
      // reason.
      if (event === 'TOKEN_REFRESHED' && nextSession.user.id === activeUserId.current) return;

      // Deferred out of the callback ON PURPOSE. supabase-js holds an internal
      // lock for the whole time this listener is running, and every PostgREST
      // call needs that same lock to attach the Authorization header — so a
      // `.from()` issued from in here waits on a lock its own caller is
      // holding. It does not fail loudly: it stalls and then surfaces as a
      // fetch error, which `toAppError` reports as "No connection".
      //
      // That was the false "No connection" on a first sign-in with correct
      // credentials, and the profile that would not load until you signed out.
      // Both were timing-dependent, which is why they looked intermittent.
      //
      // A zero-delay timeout is enough: it puts the fetch on the next tick,
      // after this listener has returned and the lock is released.
      setTimeout(() => {
        if (cancelled) return;
        void loadProfile(nextSession.user.id);
      }, 0);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile, queryClient]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  // Each one throws `AppError` on failure. Screens catch and render the
  // message; they never inspect the raw Supabase error.

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw fromAuthError(error);
    // `onAuthStateChange` sets the session and loads the profile.
  }, []);

  const signUpWithPassword = useCallback(
    async ({ email, password, displayName, accountType = 'seeker' }: SignUpInput) => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          // Read by the `handle_new_user` trigger to populate the profile row.
          // `account_type` is only honoured at creation — afterwards it is an
          // admin-only column (see `guard_profile_trust_flags`).
          data: { display_name: displayName.trim(), account_type: accountType },
        },
      });
      if (error) throw fromAuthError(error);

      // Signing up with an address that already has an account is NOT an error
      // here. With `mailer_autoconfirm` off — which this project has — Supabase
      // deliberately returns HTTP 200 and an obfuscated user rather than
      // confirming the address exists, so an attacker cannot enumerate accounts.
      //
      // The tell is `identities: []`. Without this check the screen routes to
      // verify-otp and the person waits forever for a code that is never sent.
      // The `'already registered'` branch in errors.ts never fires for password
      // sign-up on this project; it is only reachable when autoconfirm is on.
      if (data.user && data.user.identities?.length === 0) {
        throw new AppError(
          'validation',
          'An account with that email already exists. Sign in instead, or reset your password.',
        );
      }

      return { needsConfirmation: data.session === null };
    },
    [],
  );

  const signInWithOtp = useCallback(async (email: string, options?: { shouldCreateUser?: boolean }) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: options?.shouldCreateUser ?? false },
    });
    if (error) throw fromAuthError(error);
  }, []);

  const verifyOtp = useCallback(async (email: string, token: string, type: OtpType = 'email') => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type,
    });
    if (error) throw fromAuthError(error);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());

    // A "no such user" here would let anyone test which emails have accounts,
    // so the screen always shows the same confirmation. Rate limiting is the
    // one failure worth surfacing, because retrying immediately will not work.
    if (error) {
      const appError = fromAuthError(error);
      if (appError.kind === 'rate_limited') throw appError;
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw fromAuthError(error);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    // A failed sign-out still has to clear local state, or the user is stuck
    // looking at an account they asked to leave.
    activeUserId.current = null;
    setSession(null);
    setProfile(null);
    if (error) throw fromAuthError(error);
  }, []);

  const refreshProfile = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) return;
    await loadProfile(userId);
  }, [session, loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      initialising,
      profileLoading,
      profileError,
      isAuthenticated: session !== null,
      signInWithPassword,
      signUpWithPassword,
      signInWithOtp,
      verifyOtp,
      requestPasswordReset,
      updatePassword,
      signOut,
      refreshProfile,
    }),
    [
      session,
      profile,
      initialising,
      profileLoading,
      profileError,
      signInWithPassword,
      signUpWithPassword,
      signInWithOtp,
      verifyOtp,
      requestPasswordReset,
      updatePassword,
      signOut,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside <AuthProvider>. Check app/_layout.tsx.');
  }
  return context;
}

/**
 * The signed-in user's id, or throws.
 *
 * For screens that are already behind the auth guard and would otherwise need
 * a `if (!user) return null` branch that can never run.
 */
export function useRequiredUserId(): string {
  const { session } = useAuth();
  if (!session) {
    throw new Error('useRequiredUserId called outside an authenticated route.');
  }
  return session.user.id;
}
