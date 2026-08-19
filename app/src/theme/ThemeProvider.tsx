import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { themes, type Theme, type ThemeMode } from './extracted-tokens';

/**
 * Theme access.
 *
 * All values live in `extracted-tokens.ts`, which is a translation of the live
 * MSN web app's design system. That file is expected to be replaced wholesale
 * as the extraction improves — this provider, the `useTheme` hook and every
 * component are written against its exported shape, so a replacement that
 * type-checks is a drop-in.
 *
 * The rule that keeps it that way: **no component imports
 * `extracted-tokens.ts` directly, and no component writes a hex literal.**
 * Colours come from `useTheme().colors` by semantic name.
 */

const ThemeContext = createContext<Theme>(themes.light);

export interface ThemeProviderProps {
  children: ReactNode;
  /**
   * Force a mode instead of following the device. For screenshot tests and a
   * future in-app appearance setting — leave unset in the app.
   *
   * Note that dark is DERIVED, not extracted: the web app is light-only. Treat
   * it as provisional until it has been signed off against the brand.
   */
  mode?: ThemeMode;
}

export function ThemeProvider({ children, mode }: ThemeProviderProps) {
  const deviceScheme = useColorScheme();
  const resolved: ThemeMode = mode ?? (deviceScheme === 'dark' ? 'dark' : 'light');

  // `themes.light` / `themes.dark` are module constants, so this is already a
  // stable reference — no `useMemo` needed and no spurious re-renders.
  return <ThemeContext.Provider value={themes[resolved]}>{children}</ThemeContext.Provider>;
}

/**
 * The only supported way to read design tokens.
 *
 *   const t = useTheme();
 *   <View style={{ padding: t.spacing.md, backgroundColor: t.colors.surface }} />
 */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Builds a StyleSheet that depends on the theme, memoised per mode.
 *
 *   const useStyles = makeStyles((t) => ({
 *     row: { padding: t.spacing.md, backgroundColor: t.colors.surface },
 *   }));
 *
 *   function Row() {
 *     const styles = useStyles();
 *     return <View style={styles.row} />;
 *   }
 *
 * Prefer this over inline style objects in anything that renders inside a
 * list — an inline object is a new reference every render and defeats
 * memoisation.
 */
export function makeStyles<T extends Record<string, object>>(factory: (theme: Theme) => T) {
  const cache = new Map<ThemeMode, T>();

  return function useStyles(): T {
    const theme = useTheme();
    const key: ThemeMode = theme.isDark ? 'dark' : 'light';
    const cached = cache.get(key);
    if (cached) return cached;
    const built = factory(theme);
    cache.set(key, built);
    return built;
  };
}
