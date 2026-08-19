/**
 * Design tokens. Import everything theme-related from here.
 *
 *   import { useTheme, makeStyles, spacing, radii } from '@/theme';
 *
 * ## The one rule
 *
 * Components read colours from `useTheme().colors` by semantic name and never
 * write a hex literal. The raw brand values live in one file —
 * `extracted-tokens.ts`, translated from the live MSN web app — and that file
 * is expected to be replaced wholesale as the design extraction improves. The
 * indirection is what makes the swap free.
 *
 * `palette`, `lightColors` and `darkColors` are re-exported for the rare case
 * that needs a colour outside a React tree (a navigation options object built
 * at module scope, for instance). Reaching for them inside a component is a
 * bug — it hardcodes one appearance.
 */
export {
  aspectRatios,
  avatarSizes,
  borderWidths,
  controlHeights,
  darkColors,
  darkTheme,
  fontFamilies,
  fontSizes,
  fontWeights,
  iconSizes,
  layout,
  letterSpacing,
  lightColors,
  lightTheme,
  lineHeights,
  opacities,
  palette,
  radii,
  shadows,
  spacing,
  textStyles,
  themes,
  typography,
} from './extracted-tokens';

export type {
  ColorTokenName,
  ColorTokens,
  FontSizeToken,
  FontWeightToken,
  RadiusToken,
  ShadowToken,
  SpacingToken,
  TextStyle,
  TextStyleToken,
  Theme,
  ThemeMode,
} from './extracted-tokens';

export { MIN_TOUCH_TARGET, SCREEN_GUTTER, touchSlop } from './metrics';
export { useAppFonts } from './fonts';
export { makeStyles, ThemeProvider, useTheme } from './ThemeProvider';
export type { ThemeProviderProps } from './ThemeProvider';
