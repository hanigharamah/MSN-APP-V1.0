import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { isSafeRedirect } from '@/components/auth/sign-in-then';
import { useAuth } from '@/context/AuthContext';
import { registerForPush } from './register';

/**
 * How a notification behaves while the app is open.
 *
 * Set at module scope, once, because Expo keeps a single global handler and
 * registering it inside a component would re-register on every render.
 *
 * Banners are shown in the foreground deliberately. The alternative — silence
 * while the app is open — means a practitioner mid-way through editing an event
 * never learns a seat just sold. The bell badge alone is too quiet for
 * something time-sensitive.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/** `msn://event/123` → `/event/123`, which is what the router understands. */
function pathFromDeepLink(link: unknown): string | null {
  if (typeof link !== 'string' || link.length === 0) return null;
  const withoutScheme = link.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '/');
  const path = withoutScheme.startsWith('/') ? withoutScheme : `/${withoutScheme}`;
  // Same guard the sign-in redirect uses: a deep link arrives from outside the
  // app, so it is untrusted input and must not be able to send somebody
  // somewhere arbitrary.
  return isSafeRedirect(path) ? path : null;
}

/**
 * Registers this device, and routes taps on notifications.
 *
 * Mounted once at the root. Registration happens on sign-in rather than at
 * launch: a permission prompt in front of somebody who has not yet seen the
 * product is the fastest route to a permanent no, and a signed-out visitor has
 * nothing to be notified about anyway.
 */
export function usePush(): void {
  const { session, isAuthenticated } = useAuth();
  const router = useRouter();
  const registeredFor = useRef<string | null>(null);

  const profileId = session?.user.id ?? null;

  useEffect(() => {
    if (!isAuthenticated || profileId === null) return;
    // Once per signed-in person per launch. Re-running on every render of a
    // context consumer would hammer Expo's token endpoint.
    if (registeredFor.current === profileId) return;
    registeredFor.current = profileId;

    void registerForPush(profileId).then((result) => {
      if (!result.ok && result.reason !== 'denied') {
        // A refusal is a choice, not a fault. Everything else — no EAS project,
        // no APNs registration on this device — is worth seeing in the log.
        console.warn('[push] no token:', result.reason, result.detail ?? '');
      }
    });
  }, [isAuthenticated, profileId]);

  // Tapping a notification — from the background or from cold — opens whatever
  // it is about. Without this the app opens on whatever screen it last showed,
  // which makes the notification feel like it did nothing.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const path = pathFromDeepLink(response.notification.request.content.data?.deep_link);
      if (path) router.push(path as never);
    });

    return () => subscription.remove();
  }, [router]);
}
