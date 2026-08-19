import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  useFonts,
} from '@expo-google-fonts/dm-sans';

/**
 * Font registration.
 *
 * DM Sans, matching the web app (loaded there from Google Fonts in
 * `master.blade.php`). SIL Open Font License 1.1, so it ships in a mobile app
 * without restriction.
 *
 * Each weight is registered under its own family name rather than as one
 * family with `fontWeight` variants. That is not stylistic: React Native
 * cannot interpolate a variable font axis, and on Android asking for a weight
 * that was not registered under that exact family name silently falls back to
 * Roboto — a bug that only shows up on devices you do not have. The keys below
 * MUST match `fontFamilies` in `extracted-tokens.ts`.
 *
 * The root layout holds the splash screen until this resolves, so no screen
 * ever renders in the fallback face.
 */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts({
    DMSans_300Light,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
}
