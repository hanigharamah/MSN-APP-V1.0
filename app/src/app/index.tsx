import { Redirect } from 'expo-router';

/**
 * The front door.
 *
 * Without this file expo-router has no `/` route and falls through to the
 * first group in the directory — `(auth)`, which sorts before `(tabs)`. So
 * even after the forced-sign-in redirect came out of `_layout.tsx`, a cold
 * start still opened on the sign-in form: not because anything redirected
 * there, but because it was alphabetically first. Signed-in users then got a
 * visible flash of it before being bounced back to the tabs.
 *
 * Discover is the front door for everyone, signed in or not. It reads public
 * data under RLS and needs no session. The three personal tabs answer for
 * themselves (see `SignedOut`), and each action that writes asks for an
 * account at the point it needs one.
 *
 * `Redirect` rather than pushing in an effect: this renders once, before
 * paint, so there is no frame where the wrong screen is visible.
 */
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
