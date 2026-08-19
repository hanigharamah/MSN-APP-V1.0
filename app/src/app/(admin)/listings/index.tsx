import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import {
  EventListingRow,
  ServiceListingRow,
  adminKeys,
  confirmDestructive,
  searchAdminEvents,
  searchAdminServices,
  unpublishEvent,
} from '@/components/admin-people';
import type { AdminEvent, AdminService } from '@/components/admin-people';
import { SearchField, SegmentedControl, useDebouncedValue } from '@/components/discover';
import { InlineError } from '@/components/events';
import { EmptyState, ErrorState, Screen, SkeletonList, Text } from '@/components/ui';
import { qk } from '@/lib/queries/keys';
import { setServiceActive } from '@/lib/queries/services';
import { spacing } from '@/theme';

/**
 * Find a listing.
 *
 * Same principle as "find someone": a search box, not a catalogue. The
 * operator gets here holding a title or a host's name — from a report, a
 * support email, or something they saw in Discover — and needs to take one
 * thing off the marketplace.
 *
 * Two things it deliberately does that Discover cannot:
 *
 *  - **Shows drafts, cancelled events and paused services.** RLS gives an admin
 *    every row (`status = 'published' or host_id = auth.uid() or
 *    auth_is_admin()`), and the listing being hunted for is often the one that
 *    has already been pulled.
 *  - **Searches by host as well as title.** "Everything this person has listed"
 *    is the actual question when an account is under review.
 *
 * Taking something down is reversible on purpose. An event goes back to draft
 * rather than `cancelled`, and a service is deactivated rather than deleted, so
 * the host can put it back once whatever was wrong is fixed. Neither refunds
 * anybody — the copy on each confirmation says so.
 */

const MIN_TERM_LENGTH = 2;

type Tab = 'events' | 'services';

const TABS = [
  { value: 'events', label: 'Events' },
  { value: 'services', label: 'Services' },
] as const satisfies readonly { value: Tab; label: string }[];

export default function FindListingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>('events');
  const [term, setTerm] = useState('');

  const settled = useDebouncedValue(term.trim());
  const active = settled.length >= MIN_TERM_LENGTH;

  const events = useQuery({
    queryKey: adminKeys.listings.events(settled),
    queryFn: () => searchAdminEvents(settled),
    enabled: active && tab === 'events',
  });

  const services = useQuery({
    queryKey: adminKeys.listings.services(settled),
    queryFn: () => searchAdminServices(settled),
    enabled: active && tab === 'services',
  });

  const unpublish = useMutation({
    mutationFn: (eventId: string) => unpublishEvent(eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.events.all }),
  });

  const deactivate = useMutation({
    mutationFn: (serviceId: string) => setServiceActive(serviceId, false),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.services.all }),
  });

  const query = tab === 'events' ? events : services;
  const mutationError = tab === 'events' ? unpublish.error : deactivate.error;

  const openAccount = (profileId: string) => router.push(`/(admin)/people/${profileId}`);

  const confirmUnpublish = (event: AdminEvent) => {
    confirmDestructive({
      title: 'Unpublish this event?',
      message: `"${event.title}" goes back to draft and stops appearing anywhere in the app. Anyone who already bought a ticket keeps it and is not refunded or told. ${event.host?.display_name ?? 'The host'} can publish it again once whatever is wrong is fixed.`,
      confirmLabel: 'Unpublish',
      onConfirm: () => unpublish.mutate(event.id),
    });
  };

  const confirmDeactivate = (service: AdminService) => {
    confirmDestructive({
      title: 'Deactivate this service?',
      message: `"${service.title}" stops appearing in Discover and cannot be booked. Bookings already made are NOT cancelled — they stay on both calendars. ${service.provider?.display_name ?? 'The provider'} can switch it back on themselves.`,
      confirmLabel: 'Deactivate',
      onConfirm: () => deactivate.mutate(service.id),
    });
  };

  return (
    <Screen safeBottom>
      <View style={styles.controls}>
        <SearchField
          value={term}
          onChangeText={setTerm}
          placeholder="Title, or the host's name"
        />
        <SegmentedControl
          options={TABS}
          value={tab}
          onChange={setTab}
          accessibilityLabel="Listing type"
        />
      </View>

      {mutationError ? (
        <View style={styles.mutationError}>
          <InlineError error={mutationError} />
        </View>
      ) : null}

      {!active ? (
        <EmptyState
          icon="search-outline"
          title="Search for a listing"
          description="Type at least two characters of a title, or the name of whoever listed it. Drafts and paused services show up here too."
        />
      ) : query.isPending ? (
        <View
          style={styles.list}
          accessibilityLiveRegion="polite"
          accessibilityLabel="Searching listings"
        >
          <SkeletonList count={4} itemHeight={112} />
        </View>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : tab === 'events' ? (
        <ResultList
          rows={events.data ?? []}
          emptyTitle="No event matches"
          emptyDescription={`Nothing found for "${settled}" — in any status, from any host.`}
          renderRow={(event) => (
            <EventListingRow
              event={event}
              onOpenHost={() => {
                if (event.host) openAccount(event.host.id);
              }}
              onUnpublish={() => confirmUnpublish(event)}
              busy={unpublish.isPending && unpublish.variables === event.id}
            />
          )}
        />
      ) : (
        <ResultList
          rows={services.data ?? []}
          emptyTitle="No service matches"
          emptyDescription={`Nothing found for "${settled}" — active or paused, from any provider.`}
          renderRow={(service) => (
            <ServiceListingRow
              service={service}
              onOpenProvider={() => {
                if (service.provider) openAccount(service.provider.id);
              }}
              onDeactivate={() => confirmDeactivate(service)}
              busy={deactivate.isPending && deactivate.variables === service.id}
            />
          )}
        />
      )}
    </Screen>
  );
}

interface ResultListProps<T extends { id: string }> {
  rows: readonly T[];
  emptyTitle: string;
  emptyDescription: string;
  renderRow: (row: T) => ReactElement;
}

/** The empty and success branches, shared by both tabs so they cannot drift. */
function ResultList<T extends { id: string }>({
  rows,
  emptyTitle,
  emptyDescription,
  renderRow,
}: ResultListProps<T>) {
  if (rows.length === 0) {
    return <EmptyState icon="albums-outline" title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.id}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <Text variant="caption" color="muted" style={styles.count}>
          {`${rows.length} ${rows.length === 1 ? 'listing' : 'listings'}`}
        </Text>
      }
      renderItem={({ item }) => renderRow(item)}
    />
  );
}

const styles = StyleSheet.create({
  controls: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  mutationError: {
    marginBottom: spacing.sm,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  count: {
    marginBottom: spacing.xs,
  },
});
