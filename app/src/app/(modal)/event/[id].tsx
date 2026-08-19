import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import {
  AsyncSection,
  CheckoutBar,
  CheckoutSheet,
  EventActions,
  EventAgenda,
  EventGallery,
  EventGallerySkeleton,
  EventHero,
  EventHostRow,
  EventWhen,
  EventWhere,
  SectionCard,
  TicketList,
  TicketListSkeleton,
  priceSummary,
  saleStateFor,
  selectedLines,
  selectedQuantity,
  selectionCurrency,
  subtotalCents,
  useNow,
  withQuantity,
  type CheckoutBlock,
  type TicketSelection,
} from '@/components/events';
import { Badge, Button, EmptyState, ErrorState, Screen, Skeleton, Text, eventStatusBadge } from '@/components/ui';
import { signInThen } from '@/components/auth/sign-in-then';
import { ReportSheet } from '@/components/safety';
import { useAuth } from '@/context/AuthContext';
import { formatEventTime } from '@/lib/format';
import { railFor } from '@/lib/queries/bookings';
import {
  getEvent,
  listEventImages,
  listEventOccurrences,
  listTicketTypes,
  type EventWithHost,
} from '@/lib/queries/events';
import { CLIENT_PLATFORM } from '@/lib/queries/functions';
import { qk } from '@/lib/queries/keys';
import { spacing } from '@/theme';
import type { DeliveryMode, TicketType } from '@/types/database';

/**
 * Event detail and ticket selection.
 *
 * ## Shape
 *
 * Four queries, one screen. The event query owns the screen's four branches
 * (CONVENTIONS §3); images, occurrences and ticket types are subsections and
 * carry their own pending/error/empty inside `<AsyncSection>`, so a gallery
 * that fails to load does not blank a page whose ticket picker is fine.
 *
 * ## The bottom bar
 *
 * DESIGN_SOURCE §8: the web's sticky booking panel has no RN equivalent, but
 * the web already degrades it to `position: fixed` below 667px. That is what
 * `<CheckoutBar>` ports — pinned to the bottom, above the safe-area inset,
 * with the scroll view padded by its measured height so the last section is
 * never hidden underneath it.
 *
 * ## Payment rails, and why the block is predicted with `CLIENT_PLATFORM`
 *
 * `create-checkout` refuses `online_live` events with a 403 because App Store
 * guideline 3.1.3(d) requires one-to-many live events to be sold through
 * in-app purchase. The refusal is decided from the `platform` string the
 * client sends, and `lib/queries/functions.ts` sends the module constant
 * `CLIENT_PLATFORM` — so the prediction here reads the same constant rather
 * than `Platform.OS` directly. If the two ever diverge the customer would be
 * told one thing and the server asked another.
 *
 * (An earlier note here claimed `CLIENT_PLATFORM` was hard-coded to `'ios'`.
 * It is not — it derives from `Platform.OS`, and the live function only refuses
 * when `platform !== 'web'`, so the prediction and the refusal agree on both
 * iOS and Android.)
 *
 * `CheckoutSheet` still handles the 403 on arrival. The server is the
 * authority on the rail; this is a courtesy so the customer reads an
 * explanation instead of hitting a dead end.
 *
 * ## The other blocks
 *
 * `create-checkout` also refuses, with a bare 403, any attempt by a host to buy
 * a ticket to their own event. That is knowable here — `event.host_id` against
 * the session — and predicting it is the difference between a disabled button
 * that explains itself and a customer discovering the rule from a failed order.
 */
export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const { user } = useAuth();

  // One clock for the whole screen, read before any early return so the hook
  // order is stable. See `use-now.ts`: `Date.now()` during render is impure,
  // and a value frozen at mount would leave a sale window that opens while the
  // page is up looking shut until the next manual refresh.
  const now = useNow();

  const [selection, setSelection] = useState<TicketSelection>({});
  const [occurrenceId, setOccurrenceId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [barHeight, setBarHeight] = useState(0);

  const enabled = Boolean(id);

  const eventQuery = useQuery({
    queryKey: qk.events.detail(id),
    queryFn: () => getEvent(id),
    enabled,
  });

  const ticketsQuery = useQuery({
    queryKey: qk.events.ticketTypes(id),
    queryFn: () => listTicketTypes(id),
    enabled,
  });

  const occurrencesQuery = useQuery({
    queryKey: qk.events.occurrences(id),
    queryFn: () => listEventOccurrences(id),
    enabled,
  });

  const imagesQuery = useQuery({
    queryKey: qk.events.images(id),
    queryFn: () => listEventImages(id),
    enabled,
  });

  const refetchAll = () => {
    void eventQuery.refetch();
    void ticketsQuery.refetch();
    void occurrencesQuery.refetch();
    void imagesQuery.refetch();
  };

  if (eventQuery.isPending) {
    return (
      <Screen scroll safeBottom>
        <Skeleton height={200} radius="md" />
        <Skeleton height={28} width="80%" style={styles.skeletonTitle} />
        <Skeleton height={16} width="50%" style={styles.skeletonLine} />
        <Skeleton height={140} radius="xl" style={styles.skeletonBlock} />
        <Skeleton height={180} radius="xl" style={styles.skeletonBlock} />
      </Screen>
    );
  }

  if (eventQuery.isError) {
    return (
      <Screen>
        <ErrorState error={eventQuery.error} onRetry={refetchAll} />
      </Screen>
    );
  }

  const event = eventQuery.data;

  if (!event) {
    return (
      <Screen>
        <EmptyState
          icon="calendar-outline"
          title="Event not found"
          description="It may have been unpublished by the host, or the link is out of date. Other events are still open."
          actionLabel="Browse events"
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  const tickets = ticketsQuery.data ?? [];
  const occurrences = occurrencesQuery.data ?? [];
  const images = imagesQuery.data ?? [];

  // A cover is preferred, but an event with a gallery and no cover should not
  // render an empty well when a perfectly good first image exists.
  const heroUri = event.cover_url ?? images[0]?.url ?? null;

  const hasFutureOccurrence = occurrences.some(
    (occurrence) => Date.parse(occurrence.ends_at) > now,
  );
  // Only a recurring event makes the date a *choice*. On a one-off,
  // occurrences are an itinerary and `occurrence_id` stays null.
  const picksDate = event.is_recurring && hasFutureOccurrence;

  // The chosen date is client state, but it is only valid as long as the row it
  // names is still in the query AND still in the future. Both can stop being
  // true under an open screen: a host can cancel a date (`listEventOccurrences`
  // filters `is_cancelled`, so it simply vanishes on the next refetch), and
  // `useNow` ticks past the end of the one that was picked. Validating on read
  // rather than mirroring the query into an effect keeps a single source of
  // truth (CONVENTIONS §5b) and, more to the point, stops the screen sending an
  // `occurrence_id` the server will reject with a 409 or — for a date that has
  // merely passed, which the function does not check at all — silently accept.
  const selectedOccurrenceId =
    occurrenceId !== null &&
    occurrences.some(
      (occurrence) => occurrence.id === occurrenceId && Date.parse(occurrence.ends_at) > now,
    )
      ? occurrenceId
      : null;
  const needsDate = picksDate && selectedOccurrenceId === null;

  const blocked = checkoutBlockFor(event, user?.id ?? null);

  const saleState = saleStateFor(event, tickets, now);
  const lines = selectedLines(tickets, selection);
  const selectedCount = selectedQuantity(lines);
  const estimateCents = subtotalCents(lines);
  const currency = selectionCurrency(lines);

  const status = eventStatusBadge(event.status);

  const handleQuantityChange = (ticket: TicketType, quantity: number) => {
    // `now` rather than the wall clock: the row, the bar and the clamp all have
    // to agree about whether a sale window is still open.
    setSelection((current) => withQuantity(current, ticket, quantity, now));
  };

  return (
    <View style={styles.root}>
      <Screen
        scroll
        // Not `safeBottom`: the bar below is what sits over the inset, and it
        // applies the inset itself. Padding the scroll content by the bar's
        // measured height is what keeps the last section reachable.
        contentContainerStyle={{ paddingBottom: barHeight + spacing.md }}
        refreshControl={
          <RefreshControl refreshing={eventQuery.isRefetching} onRefresh={refetchAll} />
        }
      >
        <View style={styles.stack}>
          <EventHero uri={heroUri} title={event.title} />

          <View style={styles.heading}>
            {event.status !== 'published' ? (
              <Badge label={status.label} tone={status.tone} />
            ) : null}

            <Text variant="h1" heading={1}>
              {event.title}
            </Text>

            <View style={styles.metaRow}>
              {event.category ? <Badge label={event.category.name} tone="accent" /> : null}
              <Badge label={deliveryModeLabel(event.delivery_mode)} />
              {event.min_age !== null ? <Badge label={`${event.min_age}+`} tone="warning" /> : null}
            </View>

            {event.summary ? (
              <Text variant="body" color="secondary">
                {event.summary}
              </Text>
            ) : null}
          </View>

          <EventActions event={event} />

          <SectionCard title="When">
            <EventWhen
              starts_at={event.starts_at}
              ends_at={event.ends_at}
              timezone={event.timezone}
            />
          </SectionCard>

          <SectionCard title={picksDate ? 'Choose a date' : 'Dates'}>
            <AsyncSection
              isPending={occurrencesQuery.isPending}
              isError={occurrencesQuery.isError}
              error={occurrencesQuery.error}
              onRetry={() => void occurrencesQuery.refetch()}
              data={occurrences}
              pending={<Skeleton height={72} radius="lg" />}
              emptyText="This event runs once, at the time above."
            >
              {(rows) => (
                <EventAgenda
                  occurrences={rows}
                  timezone={event.timezone}
                  selectable={picksDate}
                  selectedId={selectedOccurrenceId}
                  onSelect={setOccurrenceId}
                  now={now}
                />
              )}
            </AsyncSection>
          </SectionCard>

          <SectionCard title="Tickets">
            <AsyncSection
              isPending={ticketsQuery.isPending}
              isError={ticketsQuery.isError}
              error={ticketsQuery.error}
              onRetry={() => void ticketsQuery.refetch()}
              data={tickets}
              pending={<TicketListSkeleton />}
              emptyText="The host has not opened ticket sales for this event yet."
            >
              {(rows) => (
                <TicketList
                  tickets={rows}
                  timezone={event.timezone}
                  selection={selection}
                  onChangeQuantity={handleQuantityChange}
                  blockedReason={blocked?.message ?? null}
                  needsDate={needsDate}
                  now={now}
                  isRecurring={event.is_recurring}
                />
              )}
            </AsyncSection>
          </SectionCard>

          <SectionCard title="Where">
            <EventWhere event={event} />
          </SectionCard>

          {event.description ? (
            <SectionCard title="About this event">
              <Text variant="body" color="secondary">
                {event.description}
              </Text>
            </SectionCard>
          ) : null}

          <SectionCard title="Gallery">
            <AsyncSection
              isPending={imagesQuery.isPending}
              isError={imagesQuery.isError}
              error={imagesQuery.error}
              onRetry={() => void imagesQuery.refetch()}
              data={images}
              pending={<EventGallerySkeleton />}
              emptyText="The host has not added any photos."
            >
              {(rows) => <EventGallery images={rows} title={event.title} />}
            </AsyncSection>
          </SectionCard>

          <SectionCard title="Your host">
            <EventHostRow
              host={event.host}
              {...(event.host
                ? {
                    onPress: () =>
                      router.push({
                        pathname: '/(modal)/provider/[id]',
                        params: { id: event.host_id },
                      }),
                  }
                : {})}
            />
          </SectionCard>

          {/* Last thing on the page, deliberately. Someone reporting a listing
              has usually just read the whole thing and found the problem in it.
              Quiet styling: it is a safety valve, not a call to action. */}
          <Button
            label="Report this event"
            variant="ghost"
            onPress={() => {
              if (!user) {
                signInThen(router, `/event/${event.id}`);
                return;
              }
              setReporting(true);
            }}
            style={styles.reportLink}
          />
        </View>
      </Screen>

      <CheckoutBar
        saleState={saleState}
        priceSummary={priceSummary(tickets, now)}
        selectionCurrency={currency}
        timezone={event.timezone}
        dateLine={formatEventTime(event.starts_at, event.timezone)}
        selectedCount={selectedCount}
        subtotalCents={estimateCents}
        needsDate={needsDate}
        blocked={blocked}
        onPress={() => {
          // Signed out, the bar's job is to get them an account and put them
          // back on this event — not to open a checkout sheet that cannot
          // complete. `blocked.actionable` is only ever set for that case.
          if (blocked?.actionable) {
            signInThen(router, `/event/${event.id}`);
            return;
          }
          setSheetOpen(true);
        }}
        onHeightChange={setBarHeight}
      />

      <ReportSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        subject={{ kind: 'event', id: event.id }}
        subjectLabel={event.title}
      />

      <CheckoutSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        event={event}
        lines={lines}
        occurrenceId={selectedOccurrenceId}
        onOrderPlaced={() => setSelection({})}
      />
    </View>
  );
}

/**
 * Why this event cannot be checked out at all, or null.
 *
 * Each entry mirrors a refusal `create-checkout` makes before it inserts
 * anything, so the customer reads the reason beside the button instead of
 * discovering it from a failed order. The server stays the authority — this is
 * a prediction, and `CheckoutSheet` still handles the real 403 on arrival.
 *
 * Order matters where more than one applies, and it runs event-first:
 *
 *   1. The Apple in-app-purchase rule, because it is a fact about the EVENT and
 *      holds however the viewer is signed in. Offering "Log in to book" above
 *      it promised something signing in could not deliver — they would log in
 *      and meet "Not available in the app" anyway.
 *   2. Signed out, which no other rule can be evaluated around: you cannot be
 *      the host of anything without an identity.
 *   3. The host rule, so a host looking at their own event gets the sentence
 *      that actually applies to them.
 */
function checkoutBlockFor(
  event: Pick<EventWithHost, 'delivery_mode' | 'host_id'>,
  viewerId: string | null,
): CheckoutBlock | null {
  // 1 · A fact about the EVENT, so it holds however the viewer is signed in.
  //     This has to come first: offering "Log in to book" above it promised
  //     something signing in cannot deliver — they would log in and meet
  //     "Not available in the app" anyway.
  if (railFor(event.delivery_mode, CLIENT_PLATFORM) === 'apple_iap') {
    return {
      cta: 'Not available in the app',
      message:
        'Live online events have to be sold through in-app purchase, which is not switched on in this build yet. You can still see what is on offer below.',
    };
  }

  // 2 · Signed out. Nothing below can be evaluated without an identity, and
  //     unlike the others this one is a door with a key beside it — so the
  //     button stays live and takes them to sign in. Without it, checkout was
  //     a working-looking control that failed at the server with a 401, which
  //     the person only discovered after choosing tickets.
  if (viewerId === null) {
    return {
      cta: 'Log in to book',
      message: 'Tickets are held against your account, so you need one before you can buy.',
      actionable: true,
    };
  }

  // 3 · The host, so someone looking at their own event gets the sentence that
  //     actually applies to them rather than a price and a buy button.
  if (event.host_id === viewerId) {
    return {
      cta: 'You are the host',
      message:
        'This is your event, and hosts do not buy their own tickets. Your attendee list is on the web dashboard.',
    };
  }

  return null;
}

function deliveryModeLabel(mode: DeliveryMode): string {
  switch (mode) {
    case 'in_person':
      return 'In person';
    case 'online_live':
      return 'Online, live';
    case 'one_to_one':
      return 'One to one';
  }
}

const styles = StyleSheet.create({
  reportLink: { alignSelf: 'center', marginTop: spacing.sm },
  root: {
    flex: 1,
  },
  stack: {
    gap: spacing.md,
  },
  heading: {
    gap: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
  skeletonTitle: {
    marginTop: spacing.md,
  },
  skeletonLine: {
    marginTop: spacing.xs,
  },
  skeletonBlock: {
    marginTop: spacing.md,
  },
});
