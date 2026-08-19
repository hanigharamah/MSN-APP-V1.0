import { useQuery } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ProviderServiceRow } from '@/components/provider-tools/services';
import { listServicesByProvider } from '@/lib/queries/services';
import { qk } from '@/lib/queries/keys';
import { Button, EmptyState, ErrorState, Screen, SkeletonList, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { spacing, useTheme } from '@/theme';
import type { Service } from '@/types/database';

/**
 * =============================================================================
 * My services
 * =============================================================================
 *
 * The provider's side of the one-to-one marketplace: the list of things people
 * can book an hour of.
 *
 * ## Why active and inactive are separate sections rather than a filter
 *
 * `is_active` is the only delete a service has — bookings reference it, so a
 * row is never removed — which makes "not offering this right now" a normal,
 * reversible state rather than an archive. A provider pausing a service in
 * winter needs to find it again in spring, and a segmented filter hides half
 * the list behind a tap for someone who probably has four services in total.
 *
 * The inactive section is also where the honesty lives: those services are
 * invisible to every seeker, and saying so under the heading is cheaper than
 * letting someone wonder why a listing gets no bookings.
 */
export default function MyServicesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  const providerId = session?.user.id ?? '';

  const query = useQuery({
    queryKey: qk.services.ownedBy(providerId),
    queryFn: () => listServicesByProvider(providerId, { includeInactive: true }),
    enabled: providerId !== '',
  });

  const { active, inactive } = useMemo(() => split(query.data ?? []), [query.data]);

  const openService = (serviceId: string) =>
    router.push({ pathname: '/(provider)/services/[id]', params: { id: serviceId } });

  const openNew = () => router.push('/(provider)/services/new');

  if (query.isPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'My services' }} />
        <Screen>
          <SkeletonList count={4} itemHeight={148} />
        </Screen>
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <Stack.Screen options={{ title: 'My services' }} />
        <Screen>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Screen>
      </>
    );
  }

  if (active.length === 0 && inactive.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'My services' }} />
        <Screen>
          <EmptyState
            icon="leaf-outline"
            title="No services yet"
            description="A service is one appointment somebody can book with you — a treatment, a reading, a coaching hour. You set how long it runs, what it costs and how far ahead it can be cancelled; the app finds the free slots in your calendar and takes the payment."
            actionLabel="Create a service"
            onAction={openNew}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'My services' }} />
      <Screen
        scroll
        safeBottom
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.accent}
          />
        }
      >
        <Button
          label="New service"
          onPress={openNew}
          fullWidth
          accessibilityHint="Opens a blank service to fill in"
        />

        {active.length > 0 ? (
          <View style={styles.section}>
            <Text variant="h4" heading={2}>
              {`Bookable (${active.length})`}
            </Text>
            <Text variant="bodySmall" color="muted">
              Listed on your profile and in search.
            </Text>
            <View style={styles.rows}>
              {active.map((service) => (
                <ProviderServiceRow
                  key={service.id}
                  service={service}
                  onPress={() => openService(service.id)}
                />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text variant="h4" heading={2}>
              Nothing bookable
            </Text>
            <Text variant="bodySmall" color="muted">
              Every service below is switched off, so seekers see none of them and nobody can book
              you. Switch one back on when you are ready.
            </Text>
          </View>
        )}

        {inactive.length > 0 ? (
          <View style={styles.section}>
            <Text variant="h4" heading={2}>
              {`Not offered right now (${inactive.length})`}
            </Text>
            <Text variant="bodySmall" color="muted">
              Hidden from search and from your profile. Bookings already taken are unaffected.
            </Text>
            <View style={styles.rows}>
              {inactive.map((service) => (
                <ProviderServiceRow
                  key={service.id}
                  service={service}
                  onPress={() => openService(service.id)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </Screen>
    </>
  );
}

function split(services: readonly Service[]): { active: Service[]; inactive: Service[] } {
  const active: Service[] = [];
  const inactive: Service[] = [];
  for (const service of services) {
    (service.is_active ? active : inactive).push(service);
  }
  return { active, inactive };
}

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
    gap: spacing.xxs,
  },
  rows: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
});
