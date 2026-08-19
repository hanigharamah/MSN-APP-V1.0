import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormError } from '@/components/auth/FormError';
import { BottomSheet } from '@/components/events';
import { Button, Input, Text } from '@/components/ui';
import { deviceTimeZone, formatEventRange } from '@/lib/format';
import { radii, spacing, useTheme } from '@/theme';
import {
  dateOptions,
  formatClock,
  instantFromWallClock,
  timeOptions,
  todayKey,
} from './availability-model';
import { FieldButton } from './FieldButton';
import { OptionListSheet, type SheetOption } from './OptionListSheet';
import { listTimeZones, offsetLabel, timeZoneLabel } from './time-zones';

/** How far ahead time off can be booked from this screen. */
const CALENDAR_DAYS = 366;

export interface NewBlock {
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export interface BlockEditorSheetProps {
  visible: boolean;
  /** Zone the entered clock readings are interpreted in. Defaults to the device. */
  defaultTimeZone: string;
  onSubmit: (block: NewBlock) => void;
  onClose: () => void;
  isSaving: boolean;
  saveError: unknown;
}

type OpenPicker = 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timezone' | null;

/**
 * Add a one-off block of time off.
 *
 * A block is a `timestamptz` range, not a weekly pattern — an absolute interval
 * on the world's clock. That is why this sheet asks for a zone: "9:00 AM on the
 * 20th" is not an instant until someone says whose 9am, and guessing from the
 * device is the kind of guess that puts a holiday eight hours out.
 *
 * `available_slots` subtracts blocks with a half-open range, so a block ending
 * at 12:00 does not eat a session starting at 12:00.
 */
export function BlockEditorSheet(props: BlockEditorSheetProps) {
  return (
    <BottomSheet visible={props.visible} onClose={props.onClose} title="Add time off">
      {/* Mounted only while open, so each open starts from today rather than
          from whatever was half-entered last time. */}
      {props.visible ? <BlockEditorForm {...props} /> : null}
    </BottomSheet>
  );
}

function BlockEditorForm({
  defaultTimeZone,
  onSubmit,
  onClose,
  isSaving,
  saveError,
}: BlockEditorSheetProps) {
  const theme = useTheme();
  const viewerZone = deviceTimeZone();

  const [timeZone, setTimeZone] = useState(defaultTimeZone);
  const [startDate, setStartDate] = useState(() => todayKey(defaultTimeZone));
  const [startTime, setStartTime] = useState('09:00:00');
  const [endDate, setEndDate] = useState(() => todayKey(defaultTimeZone));
  const [endTime, setEndTime] = useState('17:00:00');
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState<OpenPicker>(null);

  const days = useMemo<SheetOption[]>(
    () => dateOptions(timeZone, CALENDAR_DAYS).map((day) => ({ value: day.key, label: day.label })),
    [timeZone],
  );

  const clockOptions = useMemo<SheetOption[]>(
    () =>
      timeOptions({ step: 30, includeEndOfDay: true, extra: [startTime, endTime] }).map(
        (value) => ({ value, label: formatClock(value) }),
      ),
    [startTime, endTime],
  );

  const zoneOptions = useMemo<SheetOption[]>(() => {
    const now = new Date();
    return listTimeZones([defaultTimeZone, timeZone]).map((zone) => ({
      value: zone,
      label: timeZoneLabel(zone),
      detail: offsetLabel(zone, now),
    }));
  }, [defaultTimeZone, timeZone]);

  const startsAt = instantFromWallClock(timeZone, startDate, startTime);
  const endsAt = instantFromWallClock(timeZone, endDate, endTime);

  const problem =
    startsAt === null || endsAt === null
      ? `“${timeZone}” is not a time zone this device recognises.`
      : endsAt.getTime() <= startsAt.getTime()
        ? 'The end has to be after the start.'
        : null;

  function handleSubmit() {
    if (problem !== null || startsAt === null || endsAt === null) return;
    onSubmit({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason: reason.trim().length === 0 ? null : reason.trim(),
    });
  }

  return (
    <View style={styles.form}>
      <FormError error={saveError} />

      <FieldButton
        label="Time zone"
        value={`${timeZoneLabel(timeZone)} · ${offsetLabel(timeZone)}`}
        icon="globe-outline"
        hint="The clock the times below are read on. Time off is stored as an exact moment, not a wall-clock time."
        onPress={() => setOpen('timezone')}
      />

      <View style={styles.pair}>
        <View style={styles.grow}>
          <FieldButton
            label="From"
            value={labelForDate(days, startDate)}
            icon="calendar-outline"
            onPress={() => setOpen('startDate')}
          />
        </View>
        <View style={styles.clock}>
          <FieldButton label="At" value={formatClock(startTime)} onPress={() => setOpen('startTime')} />
        </View>
      </View>

      <View style={styles.pair}>
        <View style={styles.grow}>
          <FieldButton
            label="Until"
            value={labelForDate(days, endDate)}
            icon="calendar-outline"
            onPress={() => setOpen('endDate')}
          />
        </View>
        <View style={styles.clock}>
          <FieldButton
            label="At"
            value={formatClock(endTime)}
            onPress={() => setOpen('endTime')}
            {...(problem === null ? {} : { error: problem })}
          />
        </View>
      </View>

      <Input
        label="Reason"
        value={reason}
        onChangeText={setReason}
        hint="Only you can see this — RLS hides blocks from everyone else."
        maxLength={120}
        autoCapitalize="sentences"
      />

      {startsAt === null || endsAt === null || problem !== null ? null : (
        <View style={[styles.summary, { backgroundColor: theme.colors.surfaceMuted, borderRadius: radii.lg }]}>
          <Text variant="label" color="secondary">
            You will be unavailable
          </Text>
          <Text variant="bodySmall">
            {formatEventRange(startsAt.toISOString(), endsAt.toISOString(), timeZone)} on the{' '}
            {timeZoneLabel(timeZone)} clock.
          </Text>
          {timeZone === viewerZone ? null : (
            <Text variant="bodySmall" color="secondary">
              That is {formatEventRange(startsAt.toISOString(), endsAt.toISOString(), viewerZone)}{' '}
              where you are ({timeZoneLabel(viewerZone)}).
            </Text>
          )}
          <Text variant="caption" color="muted">
            No new bookings will be offered inside this range. Anything already booked in it stays
            booked — cancel those from Bookings if you need to.
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" onPress={onClose} disabled={isSaving} />
        <Button
          label="Add time off"
          onPress={handleSubmit}
          loading={isSaving}
          disabled={problem !== null}
        />
      </View>

      <OptionListSheet
        visible={open === 'startDate'}
        title="First day off"
        options={days}
        selected={startDate}
        onSelect={(value) => {
          setStartDate(value);
          if (endDate < value) setEndDate(value);
        }}
        onClose={() => setOpen(null)}
        searchable
        searchPlaceholder="Search dates"
      />
      <OptionListSheet
        visible={open === 'endDate'}
        title="Last day off"
        options={days.filter((day) => day.value >= startDate)}
        selected={endDate}
        onSelect={setEndDate}
        onClose={() => setOpen(null)}
        searchable
        searchPlaceholder="Search dates"
      />
      <OptionListSheet
        visible={open === 'startTime'}
        title="Starts at"
        description={`On the ${timeZoneLabel(timeZone)} clock.`}
        options={clockOptions}
        selected={startTime}
        onSelect={setStartTime}
        onClose={() => setOpen(null)}
      />
      <OptionListSheet
        visible={open === 'endTime'}
        title="Ends at"
        description={`On the ${timeZoneLabel(timeZone)} clock.`}
        options={clockOptions}
        selected={endTime}
        onSelect={setEndTime}
        onClose={() => setOpen(null)}
      />
      <OptionListSheet
        visible={open === 'timezone'}
        title="Time zone"
        description="Which clock the dates and times above are read on."
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

function labelForDate(days: readonly SheetOption[], key: string): string {
  return days.find((day) => day.value === key)?.label ?? key;
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  pair: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  grow: {
    flex: 3,
  },
  clock: {
    flex: 2,
  },
  summary: {
    gap: spacing.xxs,
    padding: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
});
