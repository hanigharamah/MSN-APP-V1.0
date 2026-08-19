import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Text, eventStatusBadge } from '@/components/ui';
import { formatDuration, formatEventRange, formatMoney, timeZoneSuffix } from '@/lib/format';
import { spacing } from '@/theme';
import type { AdminEvent, AdminService } from './admin-queries';

export interface EventListingRowProps {
  event: AdminEvent;
  onOpenHost: () => void;
  onUnpublish: () => void;
  /** True while this specific row's unpublish is in flight. */
  busy?: boolean;
}

/**
 * One event in the operator's listing search.
 *
 * The row is not itself pressable. It carries two distinct actions — go to the
 * host, or take the listing down — and a card-wide `onPress` with buttons
 * inside it is the pattern that produces accidental destructive taps. Both
 * actions are explicit controls at the accessible minimum.
 */
export function EventListingRow({
  event,
  onOpenHost,
  onUnpublish,
  busy = false,
}: EventListingRowProps) {
  const status = eventStatusBadge(event.status);
  const suffix = timeZoneSuffix(event.timezone, event.starts_at);
  const when = `${formatEventRange(event.starts_at, event.ends_at, event.timezone)}${suffix ? ` ${suffix}` : ''}`;

  return (
    <Card variant="outlined" style={styles.card}>
      <View style={styles.head}>
        <Text variant="bodyStrong" style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <Badge label={status.label} tone={status.tone} />
      </View>

      <Text variant="caption" color="muted" numberOfLines={1}>
        {when}
      </Text>

      <View style={styles.actions}>
        <Button
          label={event.host?.display_name ?? 'Unknown host'}
          variant="ghost"
          size="sm"
          onPress={onOpenHost}
          accessibilityLabel={`Open ${event.host?.display_name ?? 'the host'}'s account`}
          accessibilityHint="Opens the host account, where you can verify or suspend them"
          disabled={!event.host}
        />

        {event.status === 'published' ? (
          <Button
            label="Unpublish"
            variant="danger"
            size="sm"
            onPress={onUnpublish}
            loading={busy}
            accessibilityLabel={`Unpublish ${event.title}`}
            accessibilityHint="Returns this event to draft so nobody else can find or book it. Existing ticket holders are not refunded."
          />
        ) : null}
      </View>
    </Card>
  );
}

export interface ServiceListingRowProps {
  service: AdminService;
  onOpenProvider: () => void;
  onDeactivate: () => void;
  busy?: boolean;
}

/** One service in the operator's listing search. Same anatomy as the event row. */
export function ServiceListingRow({
  service,
  onOpenProvider,
  onDeactivate,
  busy = false,
}: ServiceListingRowProps) {
  return (
    <Card variant="outlined" style={styles.card}>
      <View style={styles.head}>
        <Text variant="bodyStrong" style={styles.title} numberOfLines={2}>
          {service.title}
        </Text>
        <Badge
          label={service.is_active ? 'Active' : 'Paused'}
          tone={service.is_active ? 'success' : 'neutral'}
        />
      </View>

      <Text variant="caption" color="muted" numberOfLines={1}>
        {`${formatMoney(service.price_cents, service.currency)} · ${formatDuration(service.duration_minutes)}`}
      </Text>

      <View style={styles.actions}>
        <Button
          label={service.provider?.display_name ?? 'Unknown provider'}
          variant="ghost"
          size="sm"
          onPress={onOpenProvider}
          accessibilityLabel={`Open ${service.provider?.display_name ?? 'the provider'}'s account`}
          accessibilityHint="Opens the provider account, where you can verify or suspend them"
          disabled={!service.provider}
        />

        {service.is_active ? (
          <Button
            label="Deactivate"
            variant="danger"
            size="sm"
            onPress={onDeactivate}
            loading={busy}
            accessibilityLabel={`Deactivate ${service.title}`}
            accessibilityHint="Takes this service off the marketplace. Bookings already made are not cancelled."
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.xs,
    gap: spacing.xxs,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
});
