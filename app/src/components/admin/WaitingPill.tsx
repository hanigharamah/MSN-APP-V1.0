import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text, type TextColor } from '@/components/ui';
import { radii, spacing, useTheme, type ColorTokenName } from '@/theme';
import { urgencyLabel, waitingFor, type Urgency } from './queue-model';

export interface WaitingPillProps {
  /** When the person started waiting. `created_at`, always. */
  since: string;
  urgency: Urgency;
  /** Injectable clock so a list of pills all agree and tests can freeze it. */
  now?: Date;
}

const FILL: Record<Urgency, ColorTokenName> = {
  overdue: 'dangerSubtle',
  'due-soon': 'warningSubtle',
  waiting: 'surfaceMuted',
};

const TEXT: Record<Urgency, TextColor> = {
  overdue: 'danger',
  'due-soon': 'warning',
  waiting: 'muted',
};

const ICON_COLOR: Record<Urgency, ColorTokenName> = {
  overdue: 'dangerText',
  'due-soon': 'warningText',
  waiting: 'textMuted',
};

/**
 * How long someone has been waiting, and whether that is now a problem.
 *
 * ## Two things it refuses to do
 *
 * **It never uses colour alone.** An overdue pill says the word "Overdue"; a
 * due-soon pill says "Due today". Greyscale, colour blindness and a screen
 * reader all get the same information the red does. This matters more here
 * than anywhere else in the app — red on this pill is the single signal that
 * decides what an operator opens next.
 *
 * **It never rounds up.** `waitingFor` floors, so a request 47 hours old reads
 * "1 day", not "2 days". Overstating how long someone has waited would make
 * the queue feel worse than it is and, worse, make the real overdue rows
 * indistinguishable from the merely old.
 *
 * Not a `Badge`: badges are one static word from a status enum, this is a
 * live-ish duration with an icon and its own tone scale.
 */
export function WaitingPill({ since, urgency, now }: WaitingPillProps) {
  const theme = useTheme();

  const duration = waitingFor(since, now);
  const flag = urgencyLabel(urgency);
  const label = flag === null ? `Waiting ${duration}` : `${flag} · waiting ${duration}`;

  return (
    <View
      style={[styles.pill, { backgroundColor: theme.colors[FILL[urgency]] }]}
      accessible
      accessibilityLabel={label}
    >
      <Ionicons
        name={urgency === 'overdue' ? 'alert-circle' : 'time-outline'}
        size={14}
        color={theme.colors[ICON_COLOR[urgency]]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text variant="label" color={TEXT[urgency]} numberOfLines={1}>
        {flag === null ? duration : `${flag} · ${duration}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radii.sm,
  },
});
