import { router as globalRouter } from 'expo-router';

type Router = typeof globalRouter;

/**
 * Send someone to sign in, and bring them back to what they were doing.
 *
 * Losing your place is the thing that makes a mid-task sign-in feel punitive.
 * Someone who has read an event, chosen a date and tapped Book should land back
 * on that event afterwards — not on Discover, hunting for it again. The path
 * they were on rides along as a `redirect` param, and the root layout hands
 * them back to it the moment the session appears (see `app/_layout.tsx`).
 *
 * `push`, not `replace`: the screen they came from stays underneath, so
 * abandoning sign-in costs one back-swipe and loses nothing.
 */
export function signInThen(router: Router, redirectTo: string): void {
  router.push({
    pathname: '/(auth)/sign-in',
    params: { redirect: redirectTo },
  });
}

/**
 * Whether a `redirect` param is safe to navigate to.
 *
 * The param reaches us through a URL, and the app registers a `msn://` scheme —
 * so a link from outside can set it. Anything that is not a plain in-app path
 * is refused and the caller falls back to the tabs.
 *
 *   - Must start with a single `/`. This rejects `https://`, `msn://` and
 *     anything else with a scheme, so sign-in can never be used to bounce
 *     someone to an external site.
 *   - `//host` is rejected too: a protocol-relative URL is still off-app.
 */
export function isSafeRedirect(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}
