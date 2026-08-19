import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { deliveryModeIcon, deliveryModeLabel } from '@/components/providers';
import { Text } from '@/components/ui';
import { railFor } from '@/lib/queries/bookings';
import { CLIENT_PLATFORM } from '@/lib/queries/functions';
import { radii, spacing, useTheme } from '@/theme';
import type { DeliveryMode } from '@/types/database';
import { NoticeCard, type NoticeTone } from './NoticeCard';

const MODES: readonly DeliveryMode[] = ['one_to_one', 'in_person', 'online_live'];

const MODE_DESCRIPTION: Record<DeliveryMode, string> = {
  one_to_one: 'A private session with one person, in person or online.',
  in_person: 'You and the person meet somewhere physical.',
  online_live: 'Streamed live to more than one person at once.',
};

export interface DeliveryModeFieldProps {
  value: DeliveryMode;
  onChange: (next: DeliveryMode) => void;
  disabled?: boolean;
}

/**
 * How the service is delivered — and what that decides about getting paid.
 *
 * `delivery_mode` looks like a description and behaves like a payment setting.
 * `railFor()` reads it to pick the rail, and `book-service` enforces the same
 * rule server-side: `online_live` on anything but web is refused outright,
 * because App Store guideline 3.1.3(d) requires one-to-many realtime to go
 * through in-app purchase, and this build has no in-app purchase wired up.
 * `in_person` is the opposite rule — 3.1.3(e) forbids IAP for anything consumed
 * outside the app.
 *
 * So the consequence is stated under the choice rather than left to be
 * discovered. A practitioner who picks `online_live` because it sounds like
 * "I work over video" would otherwise publish a service that looks perfect,
 * shows a price, and answers every booking attempt with a 403.
 */
export function DeliveryModeField({ value, onChange, disabled = false }: DeliveryModeFieldProps) {
  const theme = useTheme();
  const consequence = deliveryModeConsequence(value);

  return (
    <View style={styles.container}>
      <Text variant="bodySmall" color="secondary">
        How it is delivered
        <Text variant="bodySmall" color="danger">
          {' *'}
        </Text>
      </Text>

      <View style={styles.options} accessibilityRole="radiogroup">
        {MODES.map((mode) => {
          const selected = mode === value;

          return (
            <Pressable
              key={mode}
              onPress={() => onChange(mode)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              accessibilityLabel={`${deliveryModeLabel(mode)}. ${MODE_DESCRIPTION[mode]}`}
              accessibilityHint={deliveryModeConsequence(mode).body}
              style={({ pressed }) => [
                styles.option,
                {
                  borderRadius: radii.lg,
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                  borderWidth: selected
                    ? theme.borderWidths.thick
                    : theme.borderWidths.hairline,
                  backgroundColor: selected
                    ? theme.colors.accentSubtle
                    : pressed
                      ? theme.colors.surfaceSunken
                      : theme.colors.surface,
                },
              ]}
            >
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={selected ? theme.colors.accent : theme.colors.textMuted}
              />
              <Ionicons
                name={deliveryModeIcon(mode)}
                size={18}
                color={selected ? theme.colors.accent : theme.colors.textMuted}
              />
              <View style={styles.optionText}>
                <Text variant="bodyStrong" color={selected ? 'accent' : 'primary'}>
                  {deliveryModeLabel(mode)}
                </Text>
                <Text variant="bodySmall" color="muted">
                  {MODE_DESCRIPTION[mode]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <NoticeCard
        icon={consequence.icon}
        title={consequence.title}
        body={consequence.body}
        tone={consequence.tone}
      />
    </View>
  );
}

interface Consequence {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  tone: NoticeTone;
}

/**
 * What choosing this mode means for payment.
 *
 * Derived from `railFor(mode, CLIENT_PLATFORM)` rather than restated, so this
 * copy cannot drift from the routing the app actually performs — and
 * `CLIENT_PLATFORM` is the same constant `functions.ts` sends to the Edge
 * Function that enforces it, so the warning and the refusal agree.
 */
export function deliveryModeConsequence(mode: DeliveryMode): Consequence {
  if (railFor(mode, CLIENT_PLATFORM) === 'apple_iap') {
    return {
      icon: 'warning-outline',
      tone: 'warning',
      title: 'Nobody can book this from the app',
      body:
        'A one-to-many live session has to be sold through in-app purchase on iOS — App Store guideline 3.1.3(d). In-app purchase is not switched on in this build, so booking is refused with a 403 and no one can pay you through the app. Pick this only if the service really is a livestream to a group.',
    };
  }

  if (mode === 'online_live') {
    // Reachable on web and Android, where `railFor` returns Stripe. The server
    // is stricter than `railFor` here — `book-service` refuses `online_live`
    // for any platform except web — so this still has to warn.
    return {
      icon: 'warning-outline',
      tone: 'warning',
      title: 'Not bookable from the phone apps',
      body:
        'A one-to-many live session must be sold through the store on iOS and Android, and that is not switched on in this build. Bookings for it are refused there. Pick this only if the service really is a livestream to a group.',
    };
  }

  if (mode === 'in_person') {
    return {
      icon: 'card-outline',
      tone: 'info',
      title: 'Paid by card, never through the App Store',
      body:
        'Anything that happens face to face must not be sold through in-app purchase — App Store guideline 3.1.3(e). Bookings go through card payment and work today.',
    };
  }

  return {
    icon: 'card-outline',
    tone: 'info',
    title: 'Paid by card in the app',
    body:
      'A private session with one person is the case Apple allows to be paid outside in-app purchase, so bookings go through card payment and work today.',
  };
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  options: {
    gap: spacing.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    minHeight: 56,
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
});
