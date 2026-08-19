import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/events';
import { Button, Text } from '@/components/ui';
import { spacing } from '@/theme';
import {
  END_OF_DAY_MINUTES,
  formatClock,
  minutesToTime,
  newRuleKey,
  problemWith,
  timeOptions,
  timeToMinutes,
  WEEKDAYS,
  type DraftRule,
} from './availability-model';
import { FieldButton } from './FieldButton';
import { OptionListSheet, type SheetOption } from './OptionListSheet';
import { RuleZoneNote } from './RuleZoneNote';
import { offsetLabel, listTimeZones, timeZoneLabel } from './time-zones';

export interface RuleEditorSheetProps {
  visible: boolean;
  /** `null` when adding. */
  rule: DraftRule | null;
  /** Pre-selected weekday when adding from a specific day's row. */
  defaultWeekday: number;
  /** The provider's own `profiles.timezone`. The default for a new window. */
  defaultTimeZone: string;
  /** Zones already used by other windows, so the picker always offers them. */
  timeZonesInUse: readonly string[];
  onSave: (rule: DraftRule) => void;
  onClose: () => void;
}

type OpenPicker = 'weekday' | 'starts' | 'ends' | 'timezone' | null;

/**
 * Add or edit one weekly window.
 *
 * The zone lives on the **window**, not on the practitioner, because that is how
 * `available_slots` reads it — each rule is expanded in its own
 * `at time zone rule.timezone`. Someone who runs Tuesday mornings from Lisbon
 * and Thursday evenings from London does not have "a" time zone, and forcing one
 * would quietly move half their week.
 *
 * Nothing here writes. The sheet hands a `DraftRule` back and the section stages
 * it; the whole week is written in one `replaceAvailabilityRules` call, because
 * that call is a delete-then-insert and doing it per edit multiplies the window
 * in which a failure leaves a practitioner with no published hours at all.
 */
export function RuleEditorSheet(props: RuleEditorSheetProps) {
  // Remounted per open so every open starts from the window as it is now,
  // rather than from a draft abandoned last time.
  return (
    <BottomSheet
      visible={props.visible}
      onClose={props.onClose}
      title={props.rule === null ? 'Add hours' : 'Edit hours'}
    >
      {props.visible ? <RuleEditorForm {...props} /> : null}
    </BottomSheet>
  );
}

function RuleEditorForm({
  rule,
  defaultWeekday,
  defaultTimeZone,
  timeZonesInUse,
  onSave,
  onClose,
}: RuleEditorSheetProps) {
  const [weekday, setWeekday] = useState(rule?.weekday ?? defaultWeekday);
  const [startsTime, setStartsTime] = useState(rule?.starts_time ?? '09:00:00');
  const [endsTime, setEndsTime] = useState(rule?.ends_time ?? '17:00:00');
  const [timeZone, setTimeZone] = useState(rule?.timezone ?? defaultTimeZone);
  const [open, setOpen] = useState<OpenPicker>(null);

  const draft: DraftRule = {
    key: rule?.key ?? '',
    weekday,
    starts_time: startsTime,
    ends_time: endsTime,
    timezone: timeZone,
  };
  const problem = problemWith(draft);

  const weekdayOptions = useMemo<SheetOption[]>(
    () => WEEKDAYS.map((day) => ({ value: String(day.value), label: day.long })),
    [],
  );

  const startOptions = useMemo<SheetOption[]>(
    () =>
      timeOptions({ extra: [startsTime] }).map((value) => ({
        value,
        label: formatClock(value),
      })),
    [startsTime],
  );

  /**
   * End times are offered from the start onwards.
   *
   * `availability_end_after_start` is a check constraint, and by the time it
   * fires `replaceAvailabilityRules` has already deleted the old rows. Making
   * the invalid half of the list unreachable is worth more here than the usual
   * "validate on submit".
   */
  const endOptions = useMemo<SheetOption[]>(() => {
    const floor = timeToMinutes(startsTime);
    return timeOptions({ includeEndOfDay: true, extra: [endsTime] })
      .filter((value) => timeToMinutes(value) > floor)
      .map((value) => ({
        value,
        label: formatClock(value),
        detail: describeLength(floor, timeToMinutes(value)),
      }));
  }, [startsTime, endsTime]);

  const zoneOptions = useMemo<SheetOption[]>(() => {
    const now = new Date();
    return listTimeZones([...timeZonesInUse, timeZone]).map((zone) => ({
      value: zone,
      label: timeZoneLabel(zone),
      detail: offsetLabel(zone, now),
    }));
  }, [timeZonesInUse, timeZone]);

  function handleStartChange(next: string) {
    setStartsTime(next);
    // Keep the window valid rather than leaving the user to discover it is not.
    if (timeToMinutes(endsTime) <= timeToMinutes(next)) {
      setEndsTime(minutesToTime(Math.min(timeToMinutes(next) + 60, END_OF_DAY_MINUTES)));
    }
  }

  function handleSave() {
    if (problem !== null) return;
    onSave({ ...draft, key: rule?.key ?? newRuleKey() });
    onClose();
  }

  return (
    <View style={styles.form}>
      <FieldButton
        label="Day"
        value={WEEKDAYS.find((day) => day.value === weekday)?.long ?? 'Sunday'}
        icon="calendar-outline"
        onPress={() => setOpen('weekday')}
      />

      <View style={styles.times}>
        <View style={styles.half}>
          <FieldButton
            label="From"
            value={formatClock(startsTime)}
            icon="time-outline"
            onPress={() => setOpen('starts')}
          />
        </View>
        <View style={styles.half}>
          <FieldButton
            label="To"
            value={formatClock(endsTime)}
            icon="time-outline"
            onPress={() => setOpen('ends')}
            {...(problem === null ? {} : { error: problem })}
          />
        </View>
      </View>

      <FieldButton
        label="Time zone for these hours"
        value={`${timeZoneLabel(timeZone)} · ${offsetLabel(timeZone)}`}
        icon="globe-outline"
        hint="These hours are read on this zone's clock. Change it and the same numbers mean a different moment."
        onPress={() => setOpen('timezone')}
      />

      <RuleZoneNote rule={draft} />

      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" onPress={onClose} />
        <Button
          label={rule === null ? 'Add' : 'Save'}
          onPress={handleSave}
          disabled={problem !== null}
          accessibilityHint="Stages this window. Nothing is published until you save your week."
        />
      </View>

      <Text variant="caption" color="muted">
        Staged only. Your week is published when you press Save on the Weekly hours card.
      </Text>

      <OptionListSheet
        visible={open === 'weekday'}
        title="Day of the week"
        options={weekdayOptions}
        selected={String(weekday)}
        onSelect={(value) => setWeekday(Number.parseInt(value, 10))}
        onClose={() => setOpen(null)}
      />
      <OptionListSheet
        visible={open === 'starts'}
        title="Start time"
        description={`On the ${timeZoneLabel(timeZone)} clock.`}
        options={startOptions}
        selected={startsTime}
        onSelect={handleStartChange}
        onClose={() => setOpen(null)}
      />
      <OptionListSheet
        visible={open === 'ends'}
        title="End time"
        description={`On the ${timeZoneLabel(timeZone)} clock. A session has to finish before this.`}
        options={endOptions}
        selected={endsTime}
        onSelect={setEndsTime}
        onClose={() => setOpen(null)}
      />
      <OptionListSheet
        visible={open === 'timezone'}
        title="Time zone"
        description="Each set of hours carries its own zone. This one applies to this window only."
        options={zoneOptions}
        selected={timeZone}
        onSelect={setTimeZone}
        onClose={() => setOpen(null)}
        searchable
        searchPlaceholder="Search zones"
      />
    </View>
  );
}

function describeLength(startMinutes: number, endMinutes: number): string {
  const span = endMinutes - startMinutes;
  const hours = Math.floor(span / 60);
  const rest = span % 60;
  if (hours === 0) return `${rest} minutes open`;
  if (rest === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'} open`;
  return `${hours}h ${rest}m open`;
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  times: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  half: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
});
