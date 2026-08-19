import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Expo app config.
 *
 * Kept as TypeScript (not app.json) so environment-specific values — EAS
 * project id, Stripe merchant identifier, bundle ids per build profile — come
 * from the environment rather than being committed.
 *
 * Anything a *client* is allowed to see must be prefixed `EXPO_PUBLIC_`; those
 * values are inlined into the JS bundle at build time and are readable by
 * anyone who downloads the app. Never put a service-role key, a Stripe secret
 * key, or any provider credential here — those belong in Supabase Edge
 * Function secrets.
 */

const BUNDLE_ID = process.env.EXPO_PUBLIC_BUNDLE_ID ?? 'network.mysource.app';

/**
 * `newArchEnabled` was dropped from `ExpoConfig`'s type in SDK 57 because the
 * New Architecture is the default — but `expo prebuild` still READS it and
 * writes it into `ios/Podfile.properties.json`. Omitting it produced a pods
 * install without the New Architecture while RN 0.86's JS expects it, and the
 * app redboxed at runtime with:
 *
 *   Invariant Violation: TurboModuleRegistry.getEnforcing(...):
 *   'PlatformConstants' could not be found.
 *
 * So it stays, and the type is widened rather than the key removed.
 */
type MsnConfig = ExpoConfig & { newArchEnabled?: boolean };

export default ({ config }: ConfigContext): MsnConfig => ({
  ...config,
  name: 'My Source Network',
  slug: 'msn-app',
  version: '0.1.0',
  // WCAG 2.2 AA 1.3.4 — content must not be locked to one orientation unless
  // that orientation is essential, and a marketplace is not. It matters most to
  // somebody whose device is fixed in a mount and cannot be turned.
  //
  // NOTE: the layouts have never been reviewed in landscape. Nothing sets a
  // fixed width, so they should reflow, but this needs a visual pass before it
  // ships to real users.
  orientation: 'default',
  scheme: 'msn',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,

  // Matches `lightColors.background` (the web app's `$body-bg`). Prevents the
  // white flash between splash and first paint.
  backgroundColor: '#F9F6F2',

  // The brand symbol on brand magenta, built from the web app's own
  // `Symbol_Logo_W.png` rather than redrawn — so the two products cannot drift.
  // Flattened to RGB with no alpha channel: App Store Connect rejects an icon
  // that has one, and iOS applies its own corner mask regardless.
  icon: './assets/icon.png',

  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    infoPlist: {
      // Discover ranks by proximity; permission is requested lazily, only when
      // the seeker taps "near me".
      NSLocationWhenInUseUsageDescription:
        'My Source Network uses your location to show practitioners and events near you. You can browse without it.',
      NSCameraUsageDescription:
        'Used to scan ticket QR codes at the door and to take a profile photo.',
      NSPhotoLibraryUsageDescription:
        'Used to choose a profile photo or images for your listings.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      // Keeps its transparency — Android composites the foreground over the
      // background colour itself, and insets hard for the circle/squircle mask,
      // so the mark is drawn well inside the safe area.
      foregroundImage: './assets/adaptive-icon.png',
      // Brand plum — `$primary` in the web app's _variables.scss.
      backgroundColor: '#301432',
    },
    predictiveBackGestureEnabled: false,
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'CAMERA'],
  },

  web: {
    output: 'static',
    bundler: 'metro',
  },

  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-localization',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F9F6F2',
        dark: { backgroundColor: '#1A1418' },
        resizeMode: 'contain',
      },
    ],
    [
      'expo-notifications',
      {
        // Android notification accent. Brand magenta, `$secondary`.
        color: '#913688',
      },
    ],
    [
      '@stripe/stripe-react-native',
      {
        // Apple Pay merchant id. Only needed once Apple Pay is switched on;
        // safe to leave undefined until then.
        merchantIdentifier: process.env.EXPO_PUBLIC_APPLE_MERCHANT_ID,
        enableGooglePay: true,
      },
    ],
    [
      'expo-image-picker',
      {
        // iOS shows this verbatim in the permission alert, so it says what the
        // photo is FOR. "Allow access to your photos" tells someone nothing and
        // is refused more often. App Review rejects a missing or vague string.
        photosPermission:
          'My Source Network uses your photos so you can set a profile picture and add images to your listings.',
      },
    ],
    [
      'expo-camera',
      {
        // Only used at the door, by a host scanning tickets. Saying so is the
        // difference between a reasonable request and an alarming one.
        cameraPermission:
          'My Source Network uses the camera so you can scan tickets at the door of your own events.',
        // No microphone: nothing here records. Left off deliberately so the
        // app never asks for something it cannot justify.
        recordAudioAndroid: false,
      },
    ],
  ],

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  extra: {
    router: {},
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
});
