import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormError } from '@/components/auth/FormError';
// TODO(agent · events): `Segmented` is a general control living in the
// bookings folder, whose own barrel says it should graduate to
// `@/components/ui`. Imported rather than reimplemented — a second segmented
// control is how a design system dies — but the move is still owed.
import { Segmented } from '@/components/bookings';
import { SectionCard, useNow } from '@/components/events';
import {
  welcomeWindowFor,
  YourSeekersSheet,
} from '@/components/provider-tools/events/YourSeekersSheet';
import {
  AttendeeRow,
  EventFormFields,
  NoticeCard,
  PublishPanel,
  TicketTierRow,
  TicketTierSheet,
  activeCurrencies,
  eventDraftFrom,
  eventDraftToUpdate,
  hasEventDraftErrors,
  hostTicketTypesKey,
  listTicketTypesForHost,
  lockedCurrencyFor,
  publishChecksFor,
  validateEventDraft,
  type EventDraft,
} from '@/components/provider-tools/events';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Screen,
  Skeleton,
  SkeletonList,
  Text,
  eventStatusBadge,
} from '@/components/ui';
import { useRequiredUserId } from '@/context/AuthContext';
import {
  cancelEvent,
  getEvent,
  listCategories,
  listEventOccurrences,
  publishEvent,
  updateEvent,
  type EventWithHost,
} from '@/lib/queries/events';
import { qk } from '@/lib/queries/keys';
import { checkInTicket, listEventTickets } from '@/lib/queries/orders';
import { spacing, useTheme } from '@/theme';
import type { TicketType } from '@/types/database';

/**
 * One of the host's events: edit it, price it, publish it, work the door.
 *
 * Three panels rather than three routes, because they are three views of one
 * row and a host moves between them constantly while setting an event up —
 * add a tier, check the publish list, add another tier.
 *
 * The screen never derives "is this live" from dates or from `published_at`.
 * `events.status` is the only signal, exactly as the buyer's screen treats it.
 */

type Panel = 'details' | 'tickets' | 'attendees';

const PANELS = [
  { value: 'details', label: 'Details', accessibilityHint: 'Edit and publish this event' },
  { value: 'tickets', label: 'Tickets', accessibilityHint: 'Price and stock' },
  { value: 'attendees', label: 'Attendees', accessibilityHint: 'Who is coming, and check-in' },
] as const satisfies readonly { value: Panel; label: string; accessibilityHint: string }[];

export default function HostedEventScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [panel, setPanel] = useState<Panel>('details');

  const event = useQuery({
    queryKey: qk.events.detail(id),
    queryFn: () => getEvent(id),
    enabled: Boolean(id),
  });

  // Loaded here rather than inside the tickets panel so the publish checklist
  // on the details panel can see the tiers without switching to them.
  const tickets = useQuery({
    queryKey: hostTicketTypesKey(id),
    queryFn: () => listTicketTypesForHost(id),
    enabled: Boolean(id),
  });

  if (event.isPending) {
    return (
      <Screen scroll safeBottom>
        <Stack.Screen options={{ title: 'Event' }} />
        <Skeleton height={28} width="70%" />
        <View style={styles.skeletonBlock}>
          <SkeletonList count={3} />
        </View>
      </Screen>
    );
  }

  if (event.isError) {
    return (
      <Screen safeBottom>
        <Stack.Screen options={{ title: 'Event' }} />
        <ErrorState error={event.error} onRetry={() => void event.refetch()} />
      </Screen>
    );
  }

  if (!event.data) {
    return (
      <Screen safeBottom>
        <Stack.Screen options={{ title: 'Event' }} />
        <EmptyState
          icon="calendar-outline"
          title="Not found"
          description="This event does not exist, or it is not yours to manage."
          actionLabel="Back to Listings"
          onAction={() => router.replace('/(tabs)/listings')}
        />
      </Screen>
    );
  }

  const row = event.data;
  const status = eventStatusBadge(row.status);

  return (
    // The welcome bar is a SIBLING of the scroll, not a child. `Screen scroll`
    // wraps children in a ScrollView, where `position: absolute` pins to the
    // bottom of the CONTENT — which on this screen is a very long form, so the
    // bar sat hundreds of points below the fold and was never seen.
    <View style={styles.root}>
      <Screen scroll safeBottom>
        <Stack.Screen options={{ title: row.title }} />

      <View style={styles.stack}>
        <View style={styles.heading}>
          <Text variant="h2" heading={1}>
            {row.title}
          </Text>
          <Badge label={status.label} tone={status.tone} />
        </View>

        <Segmented
          options={PANELS}
          value={panel}
          onChange={setPanel}
          accessibilityLabel="Which part of this event to manage"
        />

        {panel === 'details' ? (
          <DetailsPanel
            // Remounts when the saved row changes identity, which is how the
            // form is seeded from server data without a `useEffect` mirroring
            // the query into local state.
            key={row.updated_at}
            event={row}
            tickets={tickets.data ?? []}
            ticketsLoaded={tickets.isSuccess}
          />
        ) : null}

        {panel === 'tickets' ? <TicketsPanel event={row} /> : null}

        {panel === 'attendees' ? <AttendeesPanel eventId={row.id} /> : null}
      </View>

      </Screen>

      <WelcomeEntry event={row} />
    </View>
  );
}

/**
 * The way in to "Your seekers".
 *
 * Pinned under the panels rather than buried in one, because it is the only
 * thing on this screen with a deadline — a practitioner opening the app four
 * minutes before their session should not have to find a tab.
 *
 * ## Always here, usable only near the session
 *
 * The card itself opens fifteen minutes before the start and closes at the end
 * — marking somebody present at a session three weeks away is not a thing that
 * should be possible. But the *button* is always on the page, disabled and
 * naming the time it opens, so the practitioner meets it once while setting the
 * session up rather than discovering it four minutes before they need it.
 *
 * Drafts are the exception: nobody can have booked, so there is nothing to
 * promise.
 */
function WelcomeEntry({ event }: { event: EventWithHost }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  // Every 30s: the countdown is minute-resolution, and a label reading "Opens
  // in 1 min" a minute after it opened would be a lie about a live control.
  const now = useNow(30_000);

  const window = welcomeWindowFor(event.starts_at, event.ends_at, event.timezone, now);

  if (event.status !== 'published') return null;

  return (
    <>
      <View style={[styles.welcomeBar, { backgroundColor: theme.colors.background }]}>
        <Button
          label={window.label}
          fullWidth
          disabled={window.state !== 'open'}
          onPress={() => setOpen(true)}
          accessibilityLabel="Your seekers"
          accessibilityHint={
            window.state === 'open'
              ? 'Shows who has booked, so you can mark people as they arrive'
              : // Disabled controls are announced as such, so this only has to
                // supply the reason.
                `${window.label}. Available from 15 minutes before the session until it ends.`
          }
        />
        <View style={{ height: insets.bottom }} />
      </View>

      {/* Mounted only while open, and closed the moment the window passes, so a
          card left on screen cannot outlive the session it belongs to. */}
      <YourSeekersSheet
        eventId={event.id}
        visible={open && window.state === 'open'}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// -----------------------------------------------------------------------------
// Details
// -----------------------------------------------------------------------------

function DetailsPanel({
  event,
  tickets,
  ticketsLoaded,
}: {
  event: EventWithHost;
  tickets: readonly TicketType[];
  ticketsLoaded: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // The publish checklist compares the event's start against "now". Same
  // reasoning as the tickets panel: never `Date.now()` during render.
  const now = useNow();

  const saved = useMemo(() => eventDraftFrom(event), [event]);
  const [draft, setDraft] = useState<EventDraft>(saved);
  const [submitted, setSubmitted] = useState(false);

  const categories = useQuery({ queryKey: qk.categories.list, queryFn: listCategories });

  const invalidateEvent = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.events.detail(event.id) }),
      queryClient.invalidateQueries({ queryKey: qk.events.all }),
    ]);
  };

  const save = useMutation({
    mutationFn: () => updateEvent(event.id, eventDraftToUpdate(draft)),
    onSuccess: invalidateEvent,
  });

  const publish = useMutation({
    mutationFn: () => publishEvent(event.id),
    onSuccess: invalidateEvent,
  });

  const cancel = useMutation({
    mutationFn: () => cancelEvent(event.id),
    onSuccess: async () => {
      await invalidateEvent();
      router.back();
    },
  });

  const errors = validateEventDraft(draft);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  const checks = useMemo(() => publishChecksFor(event, tickets, now), [event, tickets, now]);

  function handleSave() {
    setSubmitted(true);
    if (hasEventDraftErrors(errors)) return;
    save.mutate();
  }

  function confirmCancel() {
    Alert.alert(
      'Cancel this event?',
      'It stops being buyable straight away and everyone who booked will need to be refunded. This cannot be undone from the app.',
      [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Cancel event', style: 'destructive', onPress: () => cancel.mutate() },
      ],
    );
  }

  const editable = event.status === 'draft' || event.status === 'published';

  return (
    // No `KeyboardAvoidingView`: the screen is already a ScrollView, and
    // nesting one inside the other collapses the content height on Android.
    <View style={styles.stack}>
      {save.isError ? <FormError error={save.error} /> : null}
      {publish.isError ? <FormError error={publish.error} /> : null}
      {cancel.isError ? <FormError error={cancel.error} /> : null}

      <EventFormFields
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          if (save.isError) save.reset();
        }}
        errors={errors}
        showErrors={submitted}
        categories={categories.data ?? []}
        categoriesUnavailable={categories.isError}
      />

      <Button
        label="Save changes"
        fullWidth
        onPress={handleSave}
        loading={save.isPending}
        disabled={!dirty}
      />

      {submitted && hasEventDraftErrors(errors) ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          Some fields need attention before this can be saved.
        </Text>
      ) : null}

      {ticketsLoaded ? (
        <PublishPanel
          status={event.status}
          checks={checks}
          onPublish={() => publish.mutate()}
          publishing={publish.isPending}
          hasUnsavedChanges={dirty}
        />
      ) : (
        <SectionCard title="Publish">
          <Skeleton height={72} radius="lg" />
        </SectionCard>
      )}

      {editable ? (
        <SectionCard title="Cancel">
          <View style={styles.stackTight}>
            <Text variant="bodySmall" color="secondary">
              Cancelling sets the event to cancelled and takes it off sale. Refunds for anyone who
              already paid are handled separately — the app cannot open them for you.
            </Text>
            <Button
              label="Cancel event"
              variant="danger"
              onPress={confirmCancel}
              loading={cancel.isPending}
              accessibilityHint="Takes this event off sale permanently"
            />
          </View>
        </SectionCard>
      ) : null}
    </View>
  );
}

// -----------------------------------------------------------------------------
// Tickets
// -----------------------------------------------------------------------------

function TicketsPanel({ event }: { event: EventWithHost }) {
  const [editing, setEditing] = useState<TicketType | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // One clock for the panel, so two rows cannot disagree about whether a sale
  // window has opened, and so a window that opens while the panel is up
  // updates the row instead of waiting for a refresh.
  const now = useNow();

  const tickets = useQuery({
    queryKey: hostTicketTypesKey(event.id),
    queryFn: () => listTicketTypesForHost(event.id),
  });

  // Only to explain that ticket stock is one event-wide pool. Editing the
  // dates themselves is not part of this tool.
  const occurrences = useQuery({
    queryKey: qk.events.occurrences(event.id),
    queryFn: () => listEventOccurrences(event.id),
  });

  const rows = tickets.data ?? [];
  const currencies = activeCurrencies(rows);
  const mixed = currencies.length > 1;

  const open = (ticket: TicketType | null) => {
    setEditing(ticket);
    setSheetOpen(true);
  };

  return (
    <View style={styles.stack}>
      {mixed ? (
        <NoticeCard
          tone="danger"
          title={`Active tiers mix ${currencies.join(' and ')}`}
          body="One payment cannot span two currencies, so checkout refuses the whole basket with a 422 and nobody can buy anything on this event. Put every active tier in one currency, or switch the odd ones off."
          source="mixed_currency"
        />
      ) : null}

      {(occurrences.data?.length ?? 0) > 1 ? (
        <NoticeCard
          tone="info"
          title={`This event runs on ${occurrences.data?.length ?? 0} dates`}
          body="Ticket quantity is a single pool shared by every date. Each date carries its own capacity figure, but checkout does not enforce it — so do not rely on it to limit a particular date."
        />
      ) : null}

      <View style={styles.panelHeader}>
        <Text variant="h4" heading={2}>
          Ticket tiers
        </Text>
        <Button
          label="Add tier"
          size="sm"
          onPress={() => open(null)}
          accessibilityHint="Opens the form for a new ticket tier"
        />
      </View>

      {tickets.isPending ? (
        <SkeletonList count={2} itemHeight={120} />
      ) : tickets.isError ? (
        <ErrorState error={tickets.error} onRetry={() => void tickets.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="ticket-outline"
          title="No ticket tiers yet"
          description="An event with no tiers is visible and unbuyable. Add one before you publish."
          actionLabel="Add a tier"
          onAction={() => open(null)}
        />
      ) : (
        <View style={styles.rows}>
          {rows.map((ticket) => (
            <TicketTierRow
              key={ticket.id}
              ticket={ticket}
              timeZone={event.timezone}
              now={now}
              currencyConflict={mixed && ticket.is_active}
              onPress={() => open(ticket)}
            />
          ))}
        </View>
      )}

      <TicketTierSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        eventId={event.id}
        timeZone={event.timezone}
        eventCurrency={event.currency}
        ticket={editing}
        lockedCurrency={lockedCurrencyFor(rows, editing?.id ?? null)}
      />
    </View>
  );
}

// -----------------------------------------------------------------------------
// Attendees
// -----------------------------------------------------------------------------

function AttendeesPanel({ eventId }: { eventId: string }) {
  const router = useRouter();
  const hostId = useRequiredUserId();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const attendees = useQuery({
    queryKey: qk.events.attendees(eventId),
    queryFn: () => listEventTickets(eventId),
  });

  const checkIn = useMutation({
    mutationFn: (ticketId: string) => checkInTicket(ticketId, hostId),
    onSettled: async () => {
      setPendingId(null);
      await queryClient.invalidateQueries({ queryKey: qk.events.attendees(eventId) });
    },
  });

  const rows = attendees.data ?? [];
  const live = rows.filter((ticket) => !ticket.is_void);
  const arrived = live.filter((ticket) => ticket.checked_in_at !== null).length;

  if (attendees.isPending) return <SkeletonList count={4} itemHeight={104} />;
  if (attendees.isError) {
    return <ErrorState error={attendees.error} onRetry={() => void attendees.refetch()} />;
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="people-outline"
        title="Nobody yet"
        description="Attendees appear here as soon as the first order is paid for. Until then, the fastest thing you can do is put the event in front of people."
        actionLabel="View it as a seeker"
        onAction={() => router.push({ pathname: '/(modal)/event/[id]', params: { id: eventId } })}
      />
    );
  }

  return (
    <View style={styles.stack}>
      {/* The doors-open action. Tapping names on the list below still works
          and is the fallback for a ticket that will not scan — but with a
          queue in front of you, the camera is the job. */}
      <Button
        label="Scan tickets"
        onPress={() => router.push({ pathname: '/(provider)/check-in/[id]', params: { id: eventId } })}
        fullWidth
        style={styles.scanButton}
      />

      {checkIn.isError ? <FormError error={checkIn.error} /> : null}

      <Text variant="bodySmall" color="secondary" accessibilityLiveRegion="polite">
        {arrived} of {live.length} checked in
        {rows.length !== live.length ? ` · ${rows.length - live.length} void` : ''}
      </Text>

      <View style={styles.rows}>
        {rows.map((ticket) => (
          <AttendeeRow
            key={ticket.id}
            ticket={ticket}
            checkingIn={checkIn.isPending && pendingId === ticket.id}
            disabled={checkIn.isPending}
            onCheckIn={() => {
              setPendingId(ticket.id);
              checkIn.mutate(ticket.id);
            }}
          />
        ))}
      </View>

      {rows.length >= 20 ? (
        <Text variant="caption" color="muted">
          Showing the most recent 20. The full list is on the web dashboard.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Pinned over the panels rather than in the scroll. The Details panel is a
  // long form, so an in-flow button sat hundreds of points below the fold —
  // exactly wrong for the one control on this screen with a deadline.
  welcomeBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  scanButton: { marginBottom: spacing.xs },
  flex: {
    flex: 1,
  },
  stack: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  stackTight: {
    gap: spacing.sm,
  },
  heading: {
    gap: spacing.xs,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rows: {
    gap: spacing.xs,
  },
  skeletonBlock: {
    marginTop: spacing.md,
  },
});
