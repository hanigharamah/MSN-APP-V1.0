import { StyleSheet, View } from 'react-native';

import { Chip, Input, Text } from '@/components/ui';
import { deviceTimeZone } from '@/lib/format';
import { spacing } from '@/theme';

import { SUGGESTED_TIME_ZONES } from './datetime';

export interface TimeZoneFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/**
 * The event's own time zone.
 *
 * This column is what makes "9am in Bali" mean 9am in Bali for every viewer,
 * so it is a first-class field rather than something inferred from the device.
 * A host in London scheduling a retreat in Indonesia must be able to say so.
 *
 * Free text with suggestions, not a picker:
 * `Intl.supportedValuesOf('timeZone')` is not available on every Hermes build,
 * so a complete list cannot be enumerated reliably. Anything the engine can
 * resolve is accepted; anything it cannot is a field error, because a zone the
 * engine cannot resolve is one it cannot format either.
 */
export function TimeZoneField({ value, onChange, error }: TimeZoneFieldProps) {
  const device = deviceTimeZone();
  const suggestions = [device, ...SUGGESTED_TIME_ZONES.filter((zone) => zone !== device)].slice(
    0,
    8,
  );

  return (
    <View style={styles.container}>
      <Input
        label="Time zone"
        required
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        error={error}
        hint="The zone the event happens in. Times you enter above are read in this zone and stored as UTC."
        placeholder="Europe/London"
      />

      <Text variant="caption" color="muted">
        Common zones
      </Text>
      <View style={styles.row}>
        {suggestions.map((zone) => (
          <Chip
            key={zone}
            label={zone === device ? `${zone} (yours)` : zone}
            selected={zone === value.trim()}
            onPress={() => onChange(zone)}
            accessibilityHint={`Sets the time zone to ${zone}`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
});
