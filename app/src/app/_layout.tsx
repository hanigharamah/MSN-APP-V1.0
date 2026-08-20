import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useGlobalSearchParams, useRouter, useSegments } from 'expo-router';
import type { Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { isSafeRedirect } from '@/components/auth/sign-in-then';
import { PhotoConsentGate } from '@/components/consent/PhotoConsentGate';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActiveAccountProvider } from '@/context/ActiveAccountContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ModeProvider } from '@/context/ModeContext';
import { usePush } from '@/lib/push/usePush';
import { createQueryClient } from '@/lib/query-client';
import { ThemeProvider, useAppFonts, useTheme } from '@/theme';

// Held until fonts are loaded and the persisted session has been read, so no
// screen ever paints in the fallback font or flashes the sign-in screen at an
// already-authenticated user.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const queryClient = useMemo(() => createQueryClient(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              {/* Inside AuthProvider: mode is read per profile, so it needs
                  the session to exist before it can load the right one. */}
              <ModeProvider>
                {/* Inside ModeProvider: the two compose — you can be hosting
                    *as* a business — and the account choice is read per
                    signed-in person, so it needs the session too. */}
                <ActiveAccountProvider>
                  <RootNavigator />
                </ActiveAccountProvider>
              </ModeProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Route protection.
 *
 * Instead of conditionally rendering different navigators — which unmounts and
 * remounts the whole tree on sign-in and loses any in-flight navigation — every
 * group is always declared, and this effect redirects when the user is in the
 * wrong one.
 *
 * The `initialising` gate is the important part. On a cold start the session is
 * `null` for a few hundred milliseconds while SecureStore is read; redirecting
 * during that window bounces a signed-in user to sign-in on every launch.
 */
function RootNavigator() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, initialising } = useAuth();
  // Device registration and notification taps. Inside RootNavigator because it
  // needs both the session and the router.
  usePush();
  // Global, not local: this layout's own route has no params — the one that
  // carries `redirect` is the sign-in screen currently on top of it.
  const { redirect } = useGlobalSearchParams<{ redirect?: string }>();
  const [fontsLoaded, fontError] = useAppFonts();
  const [splashHidden, setSplashHidden] = useState(false);

  // A missing font file should not brick the app — log it and carry on in the
  // system face rather than blocking on a promise that will never resolve.
  const ready = (fontsLoaded || fontError !== null) && !initialising;

  useEffect(() => {
    if (fontError) {
      console.warn('[fonts] DM Sans failed to load; falling back to system.', fontError);
    }
  }, [fontError]);

  useEffect(() => {
    if (!ready || splashHidden) return;
    void SplashScreen.hideAsync().then(() => setSplashHidden(true));
  }, [ready, splashHidden]);

  useEffect(() => {
    if (!ready) return;

    const inAuthGroup = segments[0] === '(auth)';

    // Signing out or in moves you back to the tabs; browsing signed out does
    // NOT get bounced to a login form.
    //
    // This used to redirect every unauthenticated launch to sign-in, which put
    // a login wall in front of a marketplace nobody had seen yet. Discover, and
    // the event, service and practitioner pages behind it, read public data
    // under RLS and work with no session at all. The three personal tabs render
    // their own signed-out state (see `SignedOut`), and each action that writes
    // asks for an account at the point it actually needs one.
    //
    // The remaining redirect is the useful half: once you ARE signed in, the
    // auth screens have nothing left to do, so they hand you back to the tabs.
    if (isAuthenticated && inAuthGroup) {
      // Hand people back to whatever sent them here, if anything did. Someone
      // who tapped Book on an event should land on that event, not on Discover
      // with the event to find again. `isSafeRedirect` refuses anything that
      // is not a plain in-app path, so a `msn://` link from outside cannot use
      // sign-in to bounce a signed-in user somewhere off-app.
      if (isSafeRedirect(redirect)) {
        router.replace(redirect as Href);
        return;
      }
      router.replace('/(tabs)');
    }
  }, [ready, isAuthenticated, redirect, segments, router]);

  if (!ready) {
    // The splash screen is still up; this only shows if it is dismissed early.
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.accent,
          headerTitleStyle: {
            color: theme.colors.textHeading,
            fontFamily: theme.typography.families.semibold,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="(modal)"
          options={{
            headerShown: false,
            presentation: 'modal',
            // Modals must be dismissible by gesture — a detail sheet with no
            // visible back affordance and no swipe is a trap.
            gestureEnabled: true,
          }}
        />
        {/* Both groups have their own Stack with their own titles. Without
            these declarations the root renders a second header showing the raw
            group name — "(admin)" sitting above "Admin". */}
        <Stack.Screen
          name="notifications"
          options={{
            title: 'Notifications',
            // Without this the back button renders the previous route's NAME,
            // which for a tab is the raw group — the header read "< (tabs)".
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen name="blocked" options={{ title: 'Blocked accounts' }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="(provider)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
      </Stack>

      {/* Outside the Stack, so it sits above whatever screen the app happens to
          resume on. This is the "keeps coming back" half: the card is raised by
          the presence of an unanswered ticket, not by the booking flow, so
          closing the app mid-question changes nothing. */}
      <PhotoConsentGate />
    </>
  );
}
