import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Chip, Text } from '@/components/ui';
import type { DeliveryMode } from '@/types/database';
import { radii, spacing, useTheme } from '@/theme';
import type { NearMe } from './use-near-me';

/**
 * One band of prices, in cents against the cheapest ticket on sale.
 *
 * Free is a band rather than a separate switch. It reads as one on the
 * requirements list — "free events" and "price ranges" — but as two controls
 * they contradict each other: "Free" plus "£50–£100" is a state a seeker can
 * reach and nothing can satisfy. One row of mutually exclusive bands cannot
 * produce an empty result by construction.
 */
export interface PriceBand {
  key: string;
  label: string;
  minCents?: number;
  maxCents?: number;
  freeOnly?: boolean;
}

export const PRICE_BANDS: readonly PriceBand[] = [
  { key: 'any', label: 'Any price' },
  { key: 'free', label: 'Free', freeOnly: true },
  { key: 'under25', label: 'Under £25', maxCents: 2500 },
  { key: '25to50', label: '£25–£50', minCents: 2500, maxCents: 5000 },
  { key: '50to100', label: '£50–£100', minCents: 5000, maxCents: 10000 },
  { key: 'over100', label: '£100+', minCents: 10000 },
];

/**
 * The delivery modes, in seeker language.
 *
 * `one_to_one` is listed because it is a real mode in the database and the
 * events that use it are otherwise unfindable. There is deliberately no
 * "hybrid": the enum has no such value, so a chip for it would filter to
 * nothing forever.
 */
export const DELIVERY_OPTIONS: readonly { value: DeliveryMode; label: string }[] = [
  { value: 'in_person', label: 'In person' },
  { value: 'online_live', label: 'Online' },
  { value: 'one_to_one', label: 'One to one' },
];

export interface EventFilterState {
  priceBand: string;
  deliveryModes: DeliveryMode[];
  nearMe: boolean;
}

export const EMPTY_FILTERS: EventFilterState = {
  priceBand: 'any',
  deliveryModes: [],
  nearMe: false,
};

/** How many of these a seeker would say they had turned on. */
export function activeFilterCount(state: EventFilterState): number {
  return (
    (state.priceBand === 'any' ? 0 : 1) +
    (state.deliveryModes.length > 0 ? 1 : 0) +
    (state.nearMe ? 1 : 0)
  );
}

export interface EventFiltersSheetProps {
  visible: boolean;
  state: EventFilterState;
  nearMe: NearMe;
  onChange: (next: EventFilterState) => void;
  onClose: () => void;
}

export function EventFiltersSheet({
  visible,
  state,
  nearMe,
  onChange,
  onClose,
}: EventFiltersSheetProps) {
  const theme = useTheme();

  const setBand = (key: string) => onChange({ ...state, priceBand: key });

  const toggleMode = (mode: DeliveryMode) =>
    onChange({
      ...state,
      deliveryModes: state.deliveryModes.includes(mode)
        ? state.deliveryModes.filter((m) => m !== mode)
        : [...state.deliveryModes, mode],
    });

  // Turning it on asks for permission; the filter only becomes true once a fix
  // arrives, so a refusal leaves the switch off rather than on and lying.
  const toggleNear = () => {
    if (state.nearMe) {
      nearMe.disable();
      onChange({ ...state, nearMe: false });
      return;
    }
    nearMe.enable();
    onChange({ ...state, nearMe: true });
  };

  const locationNote =
    state.nearMe && nearMe.status === 'asking'
      ? 'Finding you…'
      : state.nearMe && nearMe.status === 'denied'
        ? 'Location is off for this app. Turn it on in Settings to use this filter.'
        : state.nearMe && nearMe.status === 'unavailable'
          ? 'We could not get a location just now. Try again in a moment.'
          : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: theme.colors.overlay }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <View style={[styles.card, { backgroundColor: theme.colors.surfaceElevated }]}>
          <View style={[styles.grabber, { backgroundColor: theme.colors.border }]} />

          <View style={styles.header}>
            <Text variant="h4">Filters</Text>
            <Pressable
              onPress={() => onChange(EMPTY_FILTERS)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityHint="Clears every filter"
            >
              <Text variant="bodySmall" style={{ color: theme.colors.accentText }}>
                Clear all
              </Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            <Section title="Price">
              <View style={styles.chips}>
                {PRICE_BANDS.map((band) => (
                  <Chip
                    key={band.key}
                    label={band.label}
                    selected={state.priceBand === band.key}
                    onPress={() => setBand(band.key)}
                  />
                ))}
              </View>
            </Section>

            <Section title="Format" hint="Pick any. Nothing selected shows them all.">
              <View style={styles.chips}>
                {DELIVERY_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={state.deliveryModes.includes(option.value)}
                    onPress={() => toggleMode(option.value)}
                  />
                ))}
              </View>
            </Section>

            <Section title="Distance">
              <View style={styles.chips}>
                <Chip
                  label="Within 20 miles"
                  selected={state.nearMe && nearMe.status === 'on'}
                  onPress={toggleNear}
                  accessibilityHint="Shows only events near you. Asks for your location."
                />
              </View>
              {locationNote ? (
                <Text variant="caption" color="muted" style={styles.note}>
                  {locationNote}
                </Text>
              ) : null}
            </Section>
          </ScrollView>

          <Button label="Show results" fullWidth onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text variant="bodyStrong">{title}</Text>
      {hint ? (
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  card: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    maxHeight: '80%',
    gap: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.xs,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { gap: spacing.lg, paddingBottom: spacing.md },
  section: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs },
  note: { marginTop: spacing.xxs },
});
