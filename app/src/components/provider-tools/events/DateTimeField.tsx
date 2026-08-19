import { StyleSheet, View } from 'react-native';

import { Button, Input, Text } from '@/components/ui';
import { formatEventTime, timeZoneSuffix } from '@/lib/format';
import { spacing } from '@/theme';

import { isPartsEmpty, partsToUtcIso, type DateTimeParts } from './datetime';

export interface DateTimeFieldProps {
  label: string;
  value: DateTimeParts;
  /** The EVENT's zone. These fields are wall-clock times in it, never the device's. */
  timeZone: string;
  onChange: (value: DateTimeParts) => void;
  dateError?: string;
  timeError?: string;
  /**
   * An error about the pair rather than either half — "sales have to close
   * after they open". Rendered under both inputs.
   */
  error?: string;
  /** Non-blocking note — a DST gap, say. Shown under the preview. */
  note?: string | null;
  hint?: string;
  /** Shows a Clear button and allows both halves to be blank. */
  optional?: boolean;
  required?: boolean;
}

/**
 * A date and a time, typed, in a named zone.
 *
 * Two text fields rather than a native picker: `@react-native-community/
 * datetimepicker` is not a dependency of this app and adding one is not this
 * pass's call. Typed input is why `datetime.ts` refuses anything it cannot
 * round-trip — MSN-DEV-2247 was a malformed date reaching a timestamp column.
 *
 * TODO(agent · events): swap the two inputs for a spinner/calendar picker when
 * a date-picker dependency lands. The parsing layer stays either way; it is
 * what converts a wall-clock time in the event's zone into the UTC instant the
 * column stores.
 *
 * The preview line underneath is the point of the control. It renders the
 * instant back through `formatEventTime` in the event's zone with
 * `timeZoneSuffix` appended when the host is somewhere else, so "10:00" is
 * visibly 10:00 where the event happens rather than where the phone is.
 */
export function DateTimeField({
  label,
  value,
  timeZone,
  onChange,
  dateError,
  timeError,
  error,
  note,
  hint,
  optional = false,
  required = false,
}: DateTimeFieldProps) {
  const iso = partsToUtcIso(value, timeZone);
  const empty = isPartsEmpty(value);

  const preview = (() => {
    if (empty) return optional ? 'Not set' : null;
    if (iso === null) return null;
    const suffix = timeZoneSuffix(timeZone, iso);
    return `${formatEventTime(iso, timeZone)}${suffix ? ` (${suffix})` : ''}`;
  })();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="bodySmall" color="secondary">
          {label}
          {required ? (
            <Text variant="bodySmall" color="danger">
              {' *'}
            </Text>
          ) : null}
        </Text>

        {optional && !empty ? (
          <Button
            label="Clear"
            variant="ghost"
            size="sm"
            onPress={() => onChange({ date: '', time: '' })}
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
          />
        ) : null}
      </View>

      <View style={styles.row}>
        <Input
          label="Date"
          containerStyle={styles.date}
          value={value.date}
          onChangeText={(date) => onChange({ ...value, date })}
          placeholder="2026-09-01"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={10}
          error={dateError}
          accessibilityLabel={`${label} date`}
        />
        <Input
          label="Time"
          containerStyle={styles.time}
          value={value.time}
          onChangeText={(time) => onChange({ ...value, time })}
          placeholder="10:00"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={5}
          error={timeError}
          accessibilityLabel={`${label} time, 24-hour clock`}
        />
      </View>

      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}

      {preview ? (
        <Text variant="caption" color="muted" accessibilityLiveRegion="polite">
          {preview}
        </Text>
      ) : null}

      {note ? (
        <Text variant="caption" color="warning">
          {note}
        </Text>
      ) : null}

      {hint && !note ? (
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xxs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  date: {
    flex: 3,
  },
  time: {
    flex: 2,
  },
});
