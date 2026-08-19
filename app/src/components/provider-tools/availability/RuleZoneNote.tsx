import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { deviceTimeZone, formatEventTime } from '@/lib/format';
import { radii, spacing, useTheme } from '@/theme';
import { formatWindow, nextOccurrence, weekdayLong, type DraftRule } from './availability-model';
import { offsetLabel, timeZoneLabel } from './time-zones';

export interface RuleZoneNoteProps {
  rule: Pick<DraftRule, 'weekday' | 'starts_time' | 'ends_time' | 'timezone'>;
  /** Compact form for a list row; the full form is for the editor. */
  compact?: boolean;
}

/**
 * What a weekly window actually means, spelled out.
 *
 * "Tuesday, 9:00 AM – 5:00 PM" is not a fact until you say whose 9am. The rule
 * carries a zone; `available_slots` expands it as
 * `(day + starts_time) at time zone rule.timezone`; the result is a set of UTC
 * instants. This note closes that gap by resolving the next real occurrence and
 * printing it on **both** clocks — the rule's and the reader's — so a window
 * that lands overnight for the person reading it says so before it is published
 * rather than after someone books 3am.
 *
 * The date is shown deliberately. Offsets move with daylight saving, so "your
 * time" is only ever true of a specific occurrence, and a bare clock reading
 * would be a promise the calendar breaks twice a year.
 */
export function RuleZoneNote({ rule, compact = false }: RuleZoneNoteProps) {
  const theme = useTheme();
  const viewerZone = deviceTimeZone();
  const occurrence = nextOccurrence(rule);

  if (occurrence === null) {
    return (
      <Text variant="caption" color="danger">
        “{rule.timezone}” is not a time zone this device recognises, so these hours cannot be
        checked here. The database will still accept it — but nothing can tell you what it means.
      </Text>
    );
  }

  const sameZone = rule.timezone === viewerZone;
  const startsAtIso = occurrence.startsAt.toISOString();
  const endsAtIso = occurrence.endsAt.toISOString();

  if (compact) {
    return (
      <Text variant="caption" color="muted">
        {timeZoneLabel(rule.timezone)} · {offsetLabel(rule.timezone, occurrence.startsAt)}
        {sameZone
          ? ' · your zone'
          : ` · ${formatEventTime(startsAtIso, viewerZone)} – ${formatEventTime(endsAtIso, viewerZone)} your time`}
      </Text>
    );
  }

  return (
    <View style={[styles.note, { backgroundColor: theme.colors.surfaceMuted, borderRadius: radii.lg }]}>
      <Text variant="label" color="secondary">
        What this means
      </Text>

      <Text variant="bodySmall">
        Every {weekdayLong(rule.weekday)}, {formatWindow(rule.starts_time, rule.ends_time)} on the{' '}
        {timeZoneLabel(rule.timezone)} clock ({offsetLabel(rule.timezone, occurrence.startsAt)}).
      </Text>

      <Text variant="bodySmall" color={sameZone ? 'secondary' : 'primary'}>
        {sameZone
          ? `That is your own zone, so the next one is ${formatEventTime(startsAtIso, viewerZone)} – ${formatEventTime(endsAtIso, viewerZone)}.`
          : `The next one is ${formatEventTime(startsAtIso, viewerZone)} – ${formatEventTime(endsAtIso, viewerZone)} where you are (${timeZoneLabel(viewerZone)}).`}
      </Text>

      <Text variant="caption" color="muted">
        Daylight saving moves this. The hours stay put on the {timeZoneLabel(rule.timezone)} clock;
        it is the equivalent time elsewhere that shifts.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    gap: spacing.xxs,
    padding: spacing.sm,
  },
});
