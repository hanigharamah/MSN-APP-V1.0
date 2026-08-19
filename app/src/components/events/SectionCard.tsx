import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { radii, spacing, useTheme } from '@/theme';

export interface SectionCardProps {
  /** Section heading. Rendered as a level-2 heading so VoiceOver can jump. */
  title?: string;
  /** Sits to the right of the title — a "See all", a count, a badge. */
  accessory?: ReactNode;
  children: ReactNode;
  /** Removes the inner padding, for edge-to-edge media inside the card. */
  flush?: boolean;
}

/**
 * The stacked content panel the web event-detail page is built from —
 * `.card.event-detail-card`: `surface` fill, hairline border, radius 16.
 *
 * Deliberately not `<Card>`: `Card` fixes `radii.lg` (8), which is right for a
 * listing tile and wrong here. DESIGN_SOURCE §6.2 pins these section cards at
 * 16, and §4 reserves that radius for exactly this kind of panel.
 *
 * Headings are standardised at `h3`. The web uses 20 / 28 / 40 across peer
 * sections of this page; DESIGN_SOURCE §6.2 flags that as an inconsistency to
 * resolve rather than reproduce.
 */
export function SectionCard({ title, accessory, children, flush = false }: SectionCardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: theme.borderWidths.hairline,
          padding: flush ? 0 : spacing.md,
        },
      ]}
    >
      {title ? (
        <View style={[styles.header, flush ? styles.headerFlush : null]}>
          <Text variant="h3" heading={2} style={styles.title}>
            {title}
          </Text>
          {accessory}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xxl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerFlush: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  title: {
    flexShrink: 1,
  },
});
