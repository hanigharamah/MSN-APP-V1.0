import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Badge, Card, Text } from '@/components/ui';
import { formatDuration, formatMoney } from '@/lib/format';
import type { Service } from '@/types/database';
import { radii, spacing, useTheme } from '@/theme';
import { deliveryModeIcon, deliveryModeLabel } from './labels';

const THUMB = 72;

export interface ServiceListItemProps {
  service: Service;
  onPress: () => void;
}

/**
 * One of a practitioner's services, as a list row.
 *
 * The whole row is a single accessible button with a composed label, so a
 * screen-reader user hears "Sound Bath, 60 minutes, in person, $45, button"
 * rather than stopping on the thumbnail, the title, the meta and the price in
 * turn.
 */
export function ServiceListItem({ service, onPress }: ServiceListItemProps) {
  const theme = useTheme();

  const price = formatMoney(service.price_cents, service.currency, { compact: true });
  const duration = formatDuration(service.duration_minutes);
  const mode = deliveryModeLabel(service.delivery_mode);

  return (
    <Card
      variant="outlined"
      onPress={onPress}
      padding="sm"
      accessibilityLabel={`${service.title}. ${duration}, ${mode}, ${price}${
        service.requires_approval ? '. Requires the practitioner to approve' : ''
      }`}
      accessibilityHint="Opens the service and its available times"
    >
      <View style={styles.row}>
        <View style={[styles.thumb, { backgroundColor: theme.colors.surfaceMuted }]}>
          {service.cover_url ? (
            <Image
              source={{ uri: service.cover_url }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Ionicons name="leaf-outline" size={24} color={theme.colors.textMuted} />
          )}
        </View>

        <View style={styles.text}>
          <Text variant="h4" numberOfLines={2}>
            {service.title}
          </Text>

          <View style={styles.meta}>
            <Ionicons name="time-outline" size={16} color={theme.colors.textMuted} />
            <Text variant="bodySmall" color="muted">
              {duration}
            </Text>
            <Ionicons
              name={deliveryModeIcon(service.delivery_mode)}
              size={16}
              color={theme.colors.textMuted}
            />
            <Text variant="bodySmall" color="muted" numberOfLines={1}>
              {mode}
            </Text>
          </View>

          <View style={styles.footer}>
            <Text variant="bodyStrong" color="accent">
              {price}
            </Text>
            {service.requires_approval ? <Badge label="Approval needed" tone="warning" /> : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
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
    marginTop: spacing.xxs,
  },
});
