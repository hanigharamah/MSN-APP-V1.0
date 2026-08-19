import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { formatEventRange, formatLocal, timeZoneSuffix } from '@/lib/format';
import { iconSizes, spacing, useTheme } from '@/theme';

export interface EventWhenProps {
  starts_at: string;
  ends_at: string;
  /** `events.timezone`. The event's own zone, not the viewer's. */
  timezone: string;
}

/**
 * When the event happens.
 *
 * The primary line is in the EVENT's zone — a retreat that starts at 9am in
 * Bali starts at 9am in Bali whoever is reading (CONVENTIONS §8). The viewer's
 * own zone is added underneath, and only when it actually differs:
 * `timeZoneSuffix` returns null for a same-zone viewer, and "9:00 AM PDT ·
 * that's 9:00 AM your time" is noise if you are already in California.
 */
export function EventWhen({ starts_at, ends_at, timezone }: EventWhenProps) {
  const theme = useTheme();
  const suffix = timeZoneSuffix(timezone, starts_at);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={
        suffix
          ? `${formatEventRange(starts_at, ends_at, timezone)} ${suffix}. That is ${formatLocal(starts_at)} in your time zone.`
          : formatEventRange(starts_at, ends_at, timezone)
      }
    >
      <Ionicons
        name="time-outline"
        size={iconSizes.md}
        color={theme.colors.textMuted}
        style={styles.icon}
      />
      <View style={styles.text}>
        <Text variant="bodyStrong">
          {formatEventRange(starts_at, ends_at, timezone)}
          {suffix ? ` ${suffix}` : ''}
        </Text>
        {suffix ? (
          <Text variant="bodySmall" color="muted">
            Starts {formatLocal(starts_at)} your time
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  icon: {
    marginTop: 3,
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
});
