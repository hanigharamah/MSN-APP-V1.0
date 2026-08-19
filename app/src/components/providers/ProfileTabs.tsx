import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { borderWidths, MIN_TOUCH_TARGET, SCREEN_GUTTER, spacing, useTheme } from '@/theme';

export type ProviderTabKey = 'services' | 'events' | 'about' | 'reviews';

export const PROVIDER_TABS: readonly { key: ProviderTabKey; label: string }[] = [
  { key: 'services', label: 'Services' },
  { key: 'events', label: 'Events' },
  { key: 'about', label: 'About' },
  { key: 'reviews', label: 'Reviews' },
] as const;

export interface ProfileTabsProps {
  active: ProviderTabKey;
  onChange: (key: ProviderTabKey) => void;
  /** Appended to the label as `Services 3`. Omit a key to leave it bare. */
  counts?: Partial<Record<ProviderTabKey, number>>;
}

/**
 * Real tabs, not the web's scroll-spy.
 *
 * DESIGN_SOURCE §6.3 and judgement call 16: the web profile renders all five
 * sections into the DOM at once and the "tabs" are anchor links that scroll to
 * them. Ported literally that means mounting every service, every event and
 * every review before the first paint — exactly the thing that makes a native
 * list feel slow. Only the selected panel is mounted here, and the screen
 * defers each tab's query until the tab is first opened.
 *
 * Visual treatment is the underline set from `_dashboard.scss:269` (the one
 * DESIGN_SOURCE picks out of five copy-pasted variants): idle secondary text
 * over a transparent 2px border, active accent over a 2px accent border, on a
 * hairline-bordered track.
 */
export function ProfileTabs({ active, onChange, counts }: ProfileTabsProps) {
  const theme = useTheme();

  return (
    <View
      style={[styles.track, { borderBottomColor: theme.colors.border }]}
      accessibilityRole="tablist"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {PROVIDER_TABS.map((tab) => {
          const selected = tab.key === active;
          const count = counts?.[tab.key];
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={count === undefined ? tab.label : `${tab.label}, ${count}`}
              style={[
                styles.tab,
                {
                  borderBottomWidth: borderWidths.thick,
                  borderBottomColor: selected ? theme.colors.accent : 'transparent',
                },
              ]}
            >
              <Text
                variant={selected ? 'bodyStrong' : 'body'}
                color={selected ? 'accent' : 'secondary'}
              >
                {count === undefined ? tab.label : `${tab.label} ${count}`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderBottomWidth: borderWidths.hairline,
  },
  strip: {
    paddingHorizontal: SCREEN_GUTTER,
    gap: spacing.lg,
  },
  tab: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxs,
  },
});
