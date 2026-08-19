import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { iconSizes, radii, spacing, useTheme } from '@/theme';

export interface ConsequencesProps {
  /**
   * What will actually happen, in plain words, one clause each. Written as
   * statements of fact ("Their profile stops appearing in search"), not
   * warnings ("Be careful!") — the operator needs to predict the outcome, not
   * be told to feel nervous about it.
   */
  items: readonly string[];
  /** `caution` tints the panel; use it for anything a person cannot undo. */
  tone?: 'neutral' | 'caution';
  /** Optional lead-in, e.g. "Suspending this account:". */
  title?: string;
}

/**
 * The consequence panel that sits above every destructive control here.
 *
 * It exists because the single most common failure of an admin tool is a
 * switch whose effects live in someone's head — the operator flips
 * `is_suspended` believing it also cancels the bookings, and a seeker turns up
 * to a session nobody is coming to. Writing the effects next to the control is
 * cheaper than any amount of training.
 *
 * ## Why this is not `AdminNotice`
 *
 * `@/components/admin`'s `AdminNotice` is the right component for ONE stated
 * fact and its explanation, and it is used for exactly that everywhere on these
 * screens — "Nothing to go on", "Closed by Priya on 3 August". Suspension has
 * four separate consequences, none of which subsumes the others, and four
 * stacked bordered coloured panels reads as an alarm rather than as a briefing.
 * So: one fact, `AdminNotice`; an enumerated list of independent effects, this.
 *
 * TODO(agent · admin): if `AdminNotice` grows an `items` variant, delete this
 * and use it — the two should not both survive long term.
 *
 * One accessible node so the whole consequence is read as a single passage
 * rather than as N unlabelled bullets.
 */
export function Consequences({ items, tone = 'neutral', title }: ConsequencesProps) {
  const theme = useTheme();
  const caution = tone === 'caution';

  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${title ? `${title} ` : ''}${items.join('. ')}`}
      style={[
        styles.panel,
        {
          backgroundColor: caution ? theme.colors.dangerSubtle : theme.colors.surfaceMuted,
          borderRadius: radii.lg,
        },
      ]}
    >
      {title ? (
        <Text variant="label" color={caution ? 'danger' : 'secondary'}>
          {title}
        </Text>
      ) : null}

      {items.map((item) => (
        <View key={item} style={styles.item}>
          <Ionicons
            name={caution ? 'alert-circle-outline' : 'information-circle-outline'}
            size={iconSizes.sm}
            color={caution ? theme.colors.dangerText : theme.colors.textMuted}
            style={styles.icon}
          />
          <Text variant="bodySmall" color="secondary" style={styles.text}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: spacing.sm,
    gap: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  icon: {
    // Nudges the glyph onto the first line's baseline rather than its box top.
    marginTop: 2,
  },
  text: {
    flex: 1,
  },
});
