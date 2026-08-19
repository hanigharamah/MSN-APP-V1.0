import * as SecureStore from 'expo-secure-store';
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

import { useAuth } from '@/context/AuthContext';
import { isProviderAccount } from '@/types/database';

/**
 * Seeking, or hosting.
 *
 * ## What this is copying, and why
 *
 * Airbnb has no "account type". Everyone is a person; some of those people have
 * listings. What they have instead is a MODE — "Switch to hosting" — which
 * changes nothing about who you are and everything about which half of the
 * product you are looking at. Same account, same name, same reviews.
 *
 * MSN had the second half of that idea already: the Bookings tab has a
 * seeker/provider toggle, because a practitioner books other practitioners too.
 * But it lived on one screen, so you switched context there and nowhere else —
 * Profile still showed you your practice tools while Bookings showed you your
 * own sessions. This lifts that toggle to the app and lets every screen agree.
 *
 * ## What mode does NOT do
 *
 * It is not permission. Hosting mode grants nothing; a seeker who forced it on
 * would see the same empty screens, and every write is still checked by RLS.
 * It only decides which of two true things the app shows you first.
 *
 * ## Why it is persisted
 *
 * A practitioner at a venue on a Saturday is hosting all day. Resetting to
 * seeking on every cold start would make them re-choose every time they opened
 * the app. Stored per profile id, so switching accounts on a shared device does
 * not inherit the last person's mode.
 */
export type AppMode = 'seeking' | 'hosting';

interface ModeContextValue {
  mode: AppMode;
  /** True when this profile can host at all — i.e. is a provider account. */
  canHost: boolean;
  /**
   * True while `mode` is still settling. Screens that render differently per
   * mode should wait rather than commit to a value that is about to change —
   * see the note on `isResolving` in the provider.
   */
  isResolving: boolean;
  setMode: (mode: AppMode) => void;
  toggle: () => void;

  /**
   * True while the "hold to switch" coach mark should be on screen.
   *
   * The switcher is a long press, and a long press nobody knows about is a
   * feature nobody has. This teaches it, then stops — see `noteProfileOpened`.
   */
  hintVisible: boolean;
  /** Plain tap on the Profile tab. May raise the hint. */
  noteProfileOpened: () => void;
  /** The switcher was opened. Retires the hint for good. */
  noteSwitcherOpened: () => void;
  /** Hide the current hint without retiring it. */
  dismissHint: () => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

// SecureStore keys accept alphanumerics, '.', '-' and '_' only. A uuid and
// this prefix are both inside that set.
const storageKey = (profileId: string) => `msn.mode.${profileId}`;
const hintKey = (profileId: string) => `msn.modehint.${profileId}`;

/**
 * How many times the coach mark may appear before it gives up.
 *
 * Three is enough to be noticed and few enough not to nag. Using the gesture
 * once retires it immediately regardless, so a daily user sees it at most once.
 */
const HINT_LIMIT = 3;
/** Sentinel stored once the gesture has been used. */
const HINT_RETIRED = 'done';

export function ModeProvider({ children }: { children: ReactNode }) {
  const { profile, profileLoading } = useAuth();
  const canHost = profile !== null && isProviderAccount(profile.account_type);
  const profileId = profile?.id ?? null;

  /**
   * The stored mode, STAMPED with the profile it belongs to.
   *
   * A bare `AppMode` here was inheritable: `canHost` clamps a seeker out of
   * hosting, but it does nothing for provider → provider. Sign out of one
   * practitioner in hosting and into another whose stored mode is seeking, and
   * between the second profile landing and their SecureStore read resolving,
   * `canHost` is already true while the mode is still the first
   * practitioner's. That window is long enough for the tab-swap effect to fire
   * and flash one account's Listings on another account's session.
   *
   * Stamping makes the mismatch visible during render, so it is corrected by
   * DERIVATION below rather than by a reset. Resetting would mean a
   * synchronous setState inside an effect, which cascades a second render on
   * every profile change and is exactly what `react-hooks/set-state-in-effect`
   * exists to stop.
   */
  const [storedMode, setStoredMode] = useState<{ id: string | null; mode: AppMode }>({
    id: null,
    mode: 'seeking',
  });

  // Anything belonging to another profile — or to no profile — reads as
  // seeking until this profile's own value arrives.
  const mode: AppMode = storedMode.id === profileId ? storedMode.mode : 'seeking';

  /**
   * Which profile the coach mark on screen belongs to, or null for none.
   *
   * Stamped for the same reason as the mode above: a bubble raised for one
   * account otherwise survives a sign-out and paints for a frame on the next
   * person's Profile — including a seeker's, who has no long press to learn.
   */
  const [hintOwner, setHintOwner] = useState<string | null>(null);
  const hintVisible = hintOwner !== null && hintOwner === profileId;

  /**
   * How many times the coach mark has been shown to this profile, or null once
   * it is retired.
   *
   * A ref, not state, because the only reader is `noteProfileOpened`, which is
   * handed to the tab bar's `tabBarButton`. React Navigation keeps the button
   * it was given, so a callback closing over a piece of state would keep
   * answering with whatever that state was when the tab bar last rendered —
   * and the real value arrives from SecureStore a tick later.
   *
   * Starts at 0 — "not shown yet" — and the stored value only ever raises it
   * or retires it. Starting at the limit instead looks safer and is worse: a
   * read that is slow, fails, or belongs to the profile you just signed out of
   * leaves the ref stuck at "exhausted" and the hint never appears again for
   * anyone. Erring the other way costs at most one extra showing to someone
   * who had already dismissed it; erring this way silently kills the feature.
   * Reset per profile below, so one account cannot inherit another's count.
   */
  const hintShown = useRef<number | null>(0);

  // Load this profile's last mode. Runs on profile change too, so switching
  // accounts picks up the right one rather than carrying the last one over.
  useEffect(() => {
    let cancelled = false;
    // Signed out, there is nothing to load and nothing to reset: `canHost` is
    // false without a profile, so `effectiveMode` below already resolves to
    // 'seeking'. Setting state here as well was both redundant and a
    // synchronous setState inside an effect, which cascades a second render.
    if (profileId === null) return;
    void SecureStore.getItemAsync(storageKey(profileId))
      // A read failure is not worth surfacing — the default is correct and the
      // person can switch again.
      .catch(() => null)
      .then((stored) => {
        if (cancelled) return;
        setStoredMode({ id: profileId, mode: stored === 'hosting' ? 'hosting' : 'seeking' });
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  // The coach mark's counter, read on the same terms as the mode above. Kept
  // in a separate effect so a failure to read one does not suppress the other.
  useEffect(() => {
    let cancelled = false;
    // Signing OUT has to clear the bubble too, which is why this runs before
    // the null check rather than after it: a coach mark raised for the last
    // account would otherwise survive the sign-out and paint for a frame on
    // the next person's Profile.
    if (profileId === null) return;
    // Synchronously, before the read: whoever just signed in starts from
    // scratch rather than inheriting the previous account's exhausted counter.
    hintShown.current = 0;
    void SecureStore.getItemAsync(hintKey(profileId))
      .catch(() => null)
      .then((stored) => {
        if (cancelled) return;
        if (stored === HINT_RETIRED) {
          hintShown.current = null;
          return;
        }
        const parsed = Number.parseInt(stored ?? '0', 10);
        hintShown.current = Number.isFinite(parsed) ? parsed : 0;
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const setMode = useCallback(
    (next: AppMode) => {
      setStoredMode({ id: profileId, mode: next });
      if (profileId !== null) {
        void SecureStore.setItemAsync(storageKey(profileId), next).catch(() => undefined);
      }
    },
    [profileId],
  );

  // A seeker is never in hosting mode. This is belt-and-braces rather than the
  // security boundary — if someone stops being a provider, or a stored value
  // outlives the account it belonged to, the app corrects itself rather than
  // rendering practice tools to somebody with no practice.
  const effectiveMode: AppMode = canHost ? mode : 'seeking';

  /*
   * Whether `mode` can be believed yet.
   *
   * Two independent async sources feed it — the profile fetch and the
   * SecureStore read — and until BOTH have landed, `canHost` is false and the
   * mode reads 'seeking' whoever you are. A practitioner who left the app in
   * hosting therefore opened it into the seeker view, saw the wrong empty
   * state, fired a wasted query for their own bookings, and then watched it all
   * swap. Every other provider surface waits on `profileLoading`; the screens
   * reading mode had nothing to wait on.
   *
   * `storedMode.id !== profileId` covers the second source: the profile has
   * landed but this profile's stored mode has not been read yet.
   */
  const isResolving =
    profileLoading || (profileId !== null && storedMode.id !== profileId);

  const dismissHint = useCallback(() => setHintOwner(null), []);

  /** Stops the coach mark permanently, on this device and the next launch. */
  const retireHint = useCallback(() => {
    hintShown.current = null;
    setHintOwner(null);
    if (profileId !== null) {
      void SecureStore.setItemAsync(hintKey(profileId), HINT_RETIRED).catch(() => undefined);
    }
  }, [profileId]);

  const noteSwitcherOpened = useCallback(() => retireHint(), [retireHint]);

  const noteProfileOpened = useCallback(() => {
    // Nothing to teach a seeker: for them the long press does nothing at all,
    // and a coach mark for an inert gesture is worse than no coach mark.
    if (!canHost) return;

    const shown = hintShown.current;
    if (shown === null || shown >= HINT_LIMIT) return;

    const next = shown + 1;
    hintShown.current = next;
    setHintOwner(profileId);
    if (profileId !== null) {
      void SecureStore.setItemAsync(hintKey(profileId), String(next)).catch(() => undefined);
    }
  }, [canHost, profileId]);

  const value = useMemo(
    () => ({
      mode: effectiveMode,
      canHost,
      isResolving,
      setMode,
      toggle: () => setMode(effectiveMode === 'hosting' ? 'seeking' : 'hosting'),
      hintVisible,
      noteProfileOpened,
      noteSwitcherOpened,
      dismissHint,
    }),
    [
      effectiveMode,
      canHost,
      isResolving,
      setMode,
      hintVisible,
      noteProfileOpened,
      noteSwitcherOpened,
      dismissHint,
    ],
  );

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

export function useMode(): ModeContextValue {
  const context = useContext(ModeContext);
  if (context === null) {
    throw new Error('useMode called outside ModeProvider.');
  }
  return context;
}
