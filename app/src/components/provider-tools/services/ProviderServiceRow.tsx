import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { deliveryModeIcon, deliveryModeLabel } from '@/components/providers';
import { Badge, Card, Text } from '@/components/ui';
import { FormError } from '@/components/auth/FormError';
import { formatCancellationWindow, formatDuration, formatMoney } from '@/lib/format';
import { qk } from '@/lib/queries/keys';
import { setServiceActive } from '@/lib/queries/services';
import { radii, spacing, useTheme } from '@/theme';
import type { Service } from '@/types/database';
import { SwitchRow } from './SwitchRow';

const THUMB = 64;

export interface ProviderServiceRowProps {
  service: Service;
  onPress: () => void;
}

/**
 * One of the provider's own services, with the switch that decides whether
 * anyone can book it.
 *
 * The row is two targets rather than one: the content block opens the editor,
 * and the switch is its own control underneath. A `Card onPress` wrapping an
 * interactive switch would announce as a single button and swallow the switch
 * entirely for a screen-reader user.
 *
 * Turning a service **off** confirms first. It is not destructive in the
 * database sense — nothing is deleted, and `is_active` is the only soft-delete
 * services have — but it removes a listing from search and from the profile,
 * and the provider deserves to know that bookings already taken are untouched
 * before they tap.
 */
export function ProviderServiceRow({ service, onPress }: ProviderServiceRowProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();

  const toggle = useMutation({
    mutationFn: (next: boolean) => setServiceActive(service.id, next),
    // Not optimistic on purpose: whether a service is bookable is exactly the
    // kind of state that must not look changed until it is.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.services.all }),
  });

  const price = formatMoney(service.price_cents, service.currency, { compact: true });
  const duration = formatDuration(service.duration_minutes);
  const mode = deliveryModeLabel(service.delivery_mode);

  function handleToggle(next: boolean) {
    if (toggle.isPending) return;
    if (toggle.isError) toggle.reset();

    if (next) {
      toggle.mutate(true);
      return;
    }

    Alert.alert(
      'Stop offering this?',
      `“${service.title}” disappears from search and from your profile, and nobody can book it. Bookings already in your calendar are not affected. You can switch it back on here whenever you like.`,
      [
        { text: 'Keep offering', style: 'cancel' },
        {
          text: 'Stop offering',
          style: 'destructive',
          onPress: () => toggle.mutate(false),
        },
      ],
    );
  }

  return (
    <Card variant="outlined" padding="sm">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${service.title}. ${duration}, ${mode}, ${price}. ${formatCancellationWindow(
          service.cancellation_window_hours,
        )}${service.requires_approval ? '. You approve each booking' : ''}`}
        accessibilityHint="Opens this service to edit it"
        style={({ pressed }) => [
          styles.pressable,
          pressed ? { backgroundColor: theme.colors.surfaceSunken, borderRadius: radii.lg } : null,
        ]}
      >
        <View style={[styles.thumb, { backgroundColor: theme.colors.surfaceMuted }]}>
          <Ionicons name="leaf-outline" size={22} color={theme.colors.textMuted} />
          {service.cover_url ? (
            <Image
              source={{ uri: service.cover_url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
              accessibilityIgnoresInvertColors
            />
          ) : null}
        </View>

        <View style={styles.text}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {service.title}
          </Text>

          <View style={styles.meta}>
            <Ionicons name="time-outline" size={14} color={theme.colors.textMuted} />
            <Text variant="caption" color="muted">
              {duration}
            </Text>
            <Ionicons
              name={deliveryModeIcon(service.delivery_mode)}
              size={14}
              color={theme.colors.textMuted}
            />
            <Text variant="caption" color="muted" numberOfLines={1}>
              {mode}
            </Text>
          </View>

          <View style={styles.footer}>
            <Text variant="bodyStrong" color="accent">
              {price}
            </Text>
            {service.requires_approval ? <Badge label="You approve" tone="warning" /> : null}
            {service.cancellation_window_hours === 0 ? (
              <Badge label="No free cancellation" tone="warning" />
            ) : null}
          </View>
        </View>

        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      </Pressable>

      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      <SwitchRow
        label={service.is_active ? 'Offering this' : 'Not offering this'}
        description={
          service.is_active
            ? 'Listed in search and bookable.'
            : 'Hidden from search. Nobody can book it.'
        }
        value={service.is_active}
        onValueChange={handleToggle}
        disabled={toggle.isPending}
        accessibilityHint={
          service.is_active
            ? 'Turning this off hides the service and stops new bookings. Bookings you already have are not affected.'
            : 'Turning this on lists the service again and lets people book it.'
        }
        testID={`service-active-${service.id}`}
      />

      {toggle.isError ? (
        <View style={styles.error}>
          <FormError error={toggle.error} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radii.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    flexWrap: 'wrap',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
  },
  error: {
    marginTop: spacing.sm,
  },
});
