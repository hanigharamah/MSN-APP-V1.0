import type { ComponentProps, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SCREEN_GUTTER, spacing, useTheme } from '@/theme';

export interface ScreenProps {
  children: ReactNode;
  /** Wraps content in a ScrollView. Do NOT use with a FlatList inside. */
  scroll?: boolean;
  /** Removes the horizontal gutter, for full-bleed media or a bare list. */
  edgeToEdge?: boolean;
  /**
   * Respect the bottom safe area. Leave `false` inside `(tabs)` — the tab bar
   * already covers it — and set it `true` on modal and stack screens.
   */
  safeBottom?: boolean;
  /** Pulled to the top of the scroll view. `<RefreshControl />`. */
  refreshControl?: ComponentProps<typeof ScrollView>['refreshControl'];
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Screen container: background colour, horizontal gutter, safe-area handling.
 *
 * Every route should start with one, so gutters line up when a user swipes
 * between tabs. The header safe area is handled by expo-router's `Stack`, so
 * only the bottom inset is applied here.
 */
export function Screen({
  children,
  scroll = false,
  edgeToEdge = false,
  safeBottom = false,
  refreshControl,
  contentContainerStyle,
  style,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const padding: ViewStyle = {
    paddingHorizontal: edgeToEdge ? 0 : SCREEN_GUTTER,
    paddingBottom: safeBottom ? insets.bottom + spacing.md : 0,
  };

  if (scroll) {
    return (
      <ScrollView
        style={[styles.flex, { backgroundColor: theme.colors.background }, style]}
        contentContainerStyle={[styles.scrollContent, padding, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        testID={testID}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View
      style={[styles.flex, { backgroundColor: theme.colors.background }, padding, style]}
      testID={testID}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: spacing.md,
  },
});
