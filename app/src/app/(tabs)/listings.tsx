import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { SignedOut } from '@/components/auth/SignedOut';
import { NewListingSheet, type ListingKind } from '@/components/provider-tools/NewListingSheet';
import { HostEventRow, ticketsSoldByEvent, ticketsSoldKey } from '@/components/provider-tools/events';
import { ProviderServiceRow } from '@/components/provider-tools/services';
import { Button, EmptyState, ErrorState, Screen, SkeletonList, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { listEventsHostedByRecent } from '@/lib/queries/events';
import { qk } from '@/lib/queries/keys';
import { listServicesByProvider } from '@/lib/queries/services';
import { spacing } from '@/theme';
import type { EventRow, Service } from '@/types/database';

/**
 * =============================================================================
 * Listings
 * =============================================================================
 *
 * Everything this practitioner offers, in one place.
 *
 * ## Why one list and not two menu items
 *
 * The umbrella is the LISTING, not the practitioner. Before this, the tools
 * were three rows under Profile — services, events, and an Availability screen
 * that only ever affected services and sat there doing nothing for anyone who
 * runs events only. Splitting by type at the top forced a question the product
 * should never ask: "which kind of host are you?" The old web app answered it
 * with an `isHealer()` flag on the person, and that flag is a fork in every
 * screen forever.
 *
 * Airbnb's Services and Experiences are the same two shapes as ours — one
 * booked into recurring hours, one booked onto a fixed date — and both sit
 * under a single Listings tab. Nobody is a "service host". You are a host, and
 * what varies is what you listed. An events-only practitioner simply has no
 * sessions here, so booking hours never appear for them.
 *
 * See `docs/spec-listings.md`.
 *
 * ## Why the state words differ per kind
 *
 * A session is Bookable or Off (`services.is_active`); an event is a Draft,
 * Live or Cancelled (`events.status`). Those are not the same axis and are
 * deliberately NOT flattened into one vocabulary — calling a session a "draft"
 * would imply a publish step that does not exist for it.
 *
 * ## Ordering
 *
 * Most recently touched first, across both kinds. A practitioner comes here to
 * finish what they were in the middle of, and `updated_at` is the only field
 * both tables share that tracks that. Grouping by kind would rebuild the split
 * this screen exists to remove.
 */
type ListingItem =
  | { kind: 'session'; id: string; updatedAt: string; service: Service }
  | { kind: 'event'; id: string; updatedAt: string; event: EventRow };

export default function ListingsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const providerId = session?.user.id ?? '';
  const signedOut = providerId === '';

  const [sheetOpen, setSheetOpen] = useState(false);

  const services = useQuery({
    queryKey: qk.services.ownedBy(providerId),
    queryFn: () => listServicesByProvider(providerId, { includeInactive: true }),
    enabled: !signedOut,
  });

  const events = useQuery({
    queryKey: qk.events.hostingRecent(providerId),
    queryFn: () => listEventsHostedByRecent(providerId),
    enabled: !signedOut,
  });

  const eventIds = useMemo(() => (events.data ?? []).map((row) => row.id), [events.data]);

  // Sold counts are their own query so a failure here leaves the rows saying
  // "Counting…" rather than replacing the whole screen with an error.
  const sold = useQuery({
    queryKey: ticketsSoldKey(providerId, eventIds),
    queryFn: () => ticketsSoldByEvent(eventIds),
    enabled: eventIds.length > 0,
  });

  const items = useMemo<ListingItem[]>(() => {
    const sessions: ListingItem[] = (services.data ?? []).map((service) => ({
      kind: 'session',
      id: service.id,
      updatedAt: service.updated_at,
      service,
    }));
    const listed: ListingItem[] = (events.data ?? []).map((event) => ({
      kind: 'event',
      id: event.id,
      updatedAt: event.updated_at,
      event,
    }));
    return [...sessions, ...listed].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [services.data, events.data]);

  if (signedOut) {
    return (
      <SignedOut
        screenTitle="Listings"
        headline="Log in to manage your listings"
        description="The sessions and events you offer all live behind your account."
      />
    );
  }

  const pending = services.isPending || events.isPending;
  // Either half failing is a broken screen: a practitioner cannot tell whether
  // the missing listings are absent or unfetched, and the honest answer is to
  // say so rather than show half a list as if it were all of it.
  const failed = services.isError || events.isError;

  const refresh = () => {
    void services.refetch();
    void events.refetch();
  };

  const startNew = (kind: ListingKind) => {
    setSheetOpen(false);
    router.push(kind === 'session' ? '/(provider)/services/new' : '/(provider)/events/new');
  };

  return (
    <>
      <Screen edgeToEdge>
        <FlatList
          data={pending || failed ? [] : items}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={services.isRefetching || events.isRefetching}
              onRefresh={refresh}
            />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Button label="New listing" onPress={() => setSheetOpen(true)} fullWidth />
              {!pending && !failed && items.length > 0 ? (
                <Text variant="bodySmall" color="secondary">
                  {countLabel(items)}
                </Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            failed ? (
              <ErrorState
                error={services.error ?? events.error}
                onRetry={refresh}
              />
            ) : pending ? (
              <SkeletonList count={4} itemHeight={148} />
            ) : (
              <EmptyState
                icon="sparkles-outline"
                title="Nothing listed yet"
                description="A session is something people book into your hours. An event is a fixed date people buy a place at. You can offer both."
                actionLabel="Create your first listing"
                onAction={() => setSheetOpen(true)}
              />
            )
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              {item.kind === 'session' ? (
                <ProviderServiceRow
                  service={item.service}
                  onPress={() => router.push(`/(provider)/services/${item.id}`)}
                />
              ) : (
                <HostEventRow
                  event={item.event}
                  ticketsSold={sold.data?.[item.id] ?? (sold.isSuccess ? 0 : null)}
                  onPress={() => router.push(`/(provider)/events/${item.id}`)}
                />
              )}
            </View>
          )}
        />
      </Screen>

      <NewListingSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onChoose={startNew}
      />
    </>
  );
}

/** "3 sessions · 1 event", skipping whichever is zero. */
function countLabel(items: readonly ListingItem[]): string {
  const sessions = items.filter((item) => item.kind === 'session').length;
  const events = items.length - sessions;
  const parts: string[] = [];
  if (sessions > 0) parts.push(`${sessions} ${sessions === 1 ? 'session' : 'sessions'}`);
  if (events > 0) parts.push(`${events} ${events === 1 ? 'event' : 'events'}`);
  return parts.join(' · ');
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: {
    marginBottom: spacing.sm,
  },
});
