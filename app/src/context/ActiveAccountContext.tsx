import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from './AuthContext';

/**
 * Which account the person is currently acting as.
 *
 * ## Not the same thing as mode
 *
 * `ModeContext` answers "am I seeking or hosting" — one identity, two views.
 * This answers "who am I acting as at all": myself, or the business, venue or
 * charity I administer. They compose: you can be hosting *as* The Old Chapel.
 *
 * ## Null means yourself
 *
 * Stored as null rather than as your own id, so a person who has never touched
 * the switcher has no stored state to go stale, and signing into a different
 * account cannot inherit the last one's selection.
 *
 * ## Scope, honestly
 *
 * This holds and persists the selection, and every surface that reads it can
 * show whose account is active. It does NOT yet re-point the app's data access
 * at the chosen account: row-level security is written against `auth.uid()`,
 * and switching what the database considers "you" means moving the hosting
 * policies onto `auth_can_act_as` (migration 0045 adds that function for
 * exactly this purpose). That is a deliberate, reviewable change of its own —
 * it decides who can edit whose listings — and it is not smuggled in here.
 */
interface ActiveAccountValue {
  /** Null = acting as yourself. */
  activeAccountId: string | null;
  setActiveAccountId: (id: string | null) => void;
}

const ActiveAccountContext = createContext<ActiveAccountValue>({
  activeAccountId: null,
  setActiveAccountId: () => {},
});

// SecureStore keys accept alphanumerics, '.', '-' and '_' only — the same
// constraint ModeContext works around, and a uuid's hyphens are already legal.
const keyFor = (viewerId: string) => `msn.active-account.${viewerId}`;

export function ActiveAccountProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;

  // Stored WITH the viewer it belongs to, and the active id is derived from
  // that pair rather than reset when the viewer changes. Same shape as
  // ModeContext, for the same reason: a synchronous setState inside the effect
  // to clear on sign-out is both redundant and an extra render cascade, and the
  // React Compiler's `react-hooks/set-state-in-effect` rule rejects it.
  const [stored, setStored] = useState<{ viewerId: string; id: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (viewerId === null) return;
    void SecureStore.getItemAsync(keyFor(viewerId))
      // A read failure is not worth surfacing — acting as yourself is the right
      // default, and the switcher is one gesture away.
      .catch(() => null)
      .then((value) => {
        if (cancelled) return;
        setStored({ viewerId, id: value });
      });
    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  // A value belonging to a previous viewer is ignored, not cleared. Signing out
  // therefore needs no write at all, and one person's choice of account can
  // never be inherited by the next person on a shared device.
  const activeAccountId =
    viewerId !== null && stored?.viewerId === viewerId ? stored.id : null;

  const setActiveAccountId = useCallback(
    (id: string | null) => {
      if (viewerId === null) return;
      // Selecting yourself clears the stored value rather than writing your own
      // id, so "nothing chosen" and "chose myself" cannot drift apart.
      const next = id === viewerId ? null : id;
      setStored({ viewerId, id: next });
      void (next === null
        ? SecureStore.deleteItemAsync(keyFor(viewerId))
        : SecureStore.setItemAsync(keyFor(viewerId), next));
    },
    [viewerId],
  );

  const value = useMemo(
    () => ({ activeAccountId, setActiveAccountId }),
    [activeAccountId, setActiveAccountId],
  );

  return (
    <ActiveAccountContext.Provider value={value}>{children}</ActiveAccountContext.Provider>
  );
}

export function useActiveAccount(): ActiveAccountValue {
  return useContext(ActiveAccountContext);
}
