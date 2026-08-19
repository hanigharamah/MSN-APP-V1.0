import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Text } from '@/components/ui';
import { spacing } from '@/theme';

export interface Fact {
  label: string;
  /**
   * The value, already formatted. Money through `formatMoney`, an offering's
   * time through `formatEventRange` in the offering's own zone, a platform
   * timestamp through `formatLocal`.
   */
  value: string;
  /** Rendered instead of `value` when the fact needs a badge or a link. */
  render?: ReactNode;
  /** Marks the value as the important one — an amount, a total. */
  emphasis?: boolean;
}

export interface FactListProps {
  /** Section heading. Announced as a level-2 heading. */
  title: string;
  facts: readonly Fact[];
  /** Anything that belongs under the facts — a notice, a note, a link. */
  children?: ReactNode;
}

/**
 * The labelled facts behind a decision.
 *
 * Deliberately a fixed label/value pair list rather than a rendering of
 * whatever columns came back. The difference is the point: this shows the six
 * things that change a decision, in a stable order, so an operator who has
 * seen one refund screen can read the next one without looking at the labels.
 * A screen that renders the row shape re-orders itself whenever the schema
 * does and has to be re-read every time.
 *
 * Each row is one accessibility node reading "Label, value" — a label and a
 * value announced as two separate stops is how a screen reader turns a table
 * into a word search.
 */
export function FactList({ title, facts, children }: FactListProps) {
  return (
    <View style={styles.section}>
      <Text variant="h4" heading={2}>
        {title}
      </Text>

      <Card variant="outlined">
        {facts.map((fact, index) => (
          <View
            key={fact.label}
            style={[styles.row, index === 0 ? null : styles.rowSpaced]}
            accessible={fact.render === undefined}
            accessibilityLabel={fact.render === undefined ? `${fact.label}, ${fact.value}` : undefined}
          >
            <Text variant="bodySmall" color="muted" style={styles.label}>
              {fact.label}
            </Text>
            {fact.render ?? (
              <Text
                variant={fact.emphasis ? 'bodyStrong' : 'bodySmall'}
                color={fact.emphasis ? 'heading' : 'primary'}
                style={styles.value}
              >
                {fact.value}
              </Text>
            )}
          </View>
        ))}

        {children}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowSpaced: {
    marginTop: spacing.sm,
  },
  label: {
    // Wide enough for "Cancellation window" on a small phone without wrapping
    // the value column into a two-character ribbon.
    width: 128,
  },
  value: {
    flex: 1,
    textAlign: 'right',
  },
});
