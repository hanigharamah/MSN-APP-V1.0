import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  BookingActionBar,
  BookingResultPanel,
  DateStrip,
  SlotPicker,
  buildDayOptions,
  deliveryModeIcon,
  deliveryModeLabel,
  groupSlotsByDay,
  isCrossTimeZone,
  rpcDateRange,
} from '@/components/providers';
import { Avatar, Badge, Card, EmptyState, ErrorState, Input, Screen, Skeleton, Text } from '@/components/ui';
import { signInThen } from '@/components/auth/sign-in-then';
import { useAuth } from '@/context/AuthContext';
import { isAppError } from '@/lib/errors';
import {
  deviceTimeZone,
  formatCancellationWindow,
  formatDuration,
  formatEventClock,
  formatEventDate,
  formatEventTime,
  formatMoney,
} from '@/lib/format';
import { getBooking } from '@/lib/queries/bookings';
import { bookService, type BookServiceResponse } from '@/lib/queries/functions';
import { qk } from '@/lib/queries/keys';
import { getProviderDetails } from '@/lib/queries/profiles';
import {
  getAvailableSlots,
  getService,
  listAvailabilityRules,
  type TimeSlot,
} from '@/lib/queries/services';
import { aspectRatios, radii, SCREEN_GUTTER, spacing, useTheme } from '@/theme';

const NOTE_MAX_LENGTH = 500;

/**
 * Service detail and the one-to-one booking flow.
 *
 * The rule this screen is built around: **every bookable time comes from
 * `getAvailableSlots`, and none of them is a promise.** The `available_slots`
 * SQL function is the only thing that can see availability rules in their own
 * zones, `availability_blocks` (invisible to seekers under RLS), other people's
 * bookings widened by `buffer_minutes`, and the seeker's own calendar. The
 * `book-service` Edge Function re-checks all of it at confirm time, so a slot
 * this picker offered can still be refused — see `bookingErrorMessage`.
 */
export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;

  const viewerTimeZone = useMemo(() => deviceTimeZone(), []);
  // Frozen for the life of the screen so "today" cannot slide under the user
  // mid-session and renumber the strip.
  const days = useMemo(() => buildDayOptions(viewerTimeZone), [viewerTimeZone]);
  const range = useMemo(() => rpcDateRange(viewerTimeZone), [viewerTimeZone]);

  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectedStartsAt, setSelectedStartsAt] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const serviceQuery = useQuery({
    queryKey: qk.services.detail(id),
    queryFn: () => getService(id),
    enabled: Boolean(id),
  });

  const service = serviceQuery.data ?? null;
  const providerId = service?.provider_id ?? null;

  /**
   * Slots for the whole strip in one call, rather than one call per tapped day.
   *
   * The key is `qk.services.availability(...)` with the service appended: two
   * services from the same provider have different durations and buffers, so
   * they do not share a slot list, but they must still share the `['services']`
   * prefix so a booking can invalidate both.
   */
  const slotsQuery = useQuery({
    queryKey: [
      ...qk.services.availability(providerId ?? 'unknown', range.fromDate, range.toDate),
      id,
    ] as const,
    queryFn: async (): Promise<TimeSlot[]> => {
      if (providerId === null) return [];
      return getAvailableSlots({
        serviceId: id,
        providerId,
        fromDate: range.fromDate,
        toDate: range.toDate,
      });
    },
    enabled: providerId !== null,
    // Shorter than the 30s default: someone else booking a slot is exactly the
    // race this screen is trying to lose gracefully.
    staleTime: 15_000,
  });

  /**
   * Why there are no slots, when there are none.
   *
   * `available_slots` returns an empty set for four completely different
   * situations — never published any hours, switched bookings off, away, or
   * simply full — and it cannot distinguish them, by design: it returns
   * timestamps and nothing else. Telling all four "no times in the next two
   * weeks" is a lie in three of them, and the useless kind of lie: it sends
   * someone back tomorrow to a practitioner who is not taking work at all.
   *
   * These two tables are both readable by a seeker under RLS (0006 restricts
   * `availability_blocks` and `bookings`, not these), so the distinction can be
   * drawn honestly on the client. Verified live against the project.
   */
  const rulesQuery = useQuery({
    queryKey: [...qk.services.all, 'rules', providerId ?? 'unknown'] as const,
    queryFn: () => (providerId === null ? [] : listAvailabilityRules(providerId)),
    enabled: providerId !== null,
  });

  // Shares `qk.profiles.providerDetails` with the profile screen, so opening a
  // service from a profile does not refetch it.
  const providerDetailsQuery = useQuery({
    queryKey: qk.profiles.providerDetails(providerId ?? 'unknown'),
    queryFn: () => (providerId === null ? null : getProviderDetails(providerId)),
    enabled: providerId !== null,
  });

  const slotsByDay = useMemo(
    () => groupSlotsByDay(slotsQuery.data ?? [], viewerTimeZone),
    [slotsQuery.data, viewerTimeZone],
  );

  const slotCountByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [key, slots] of slotsByDay) counts.set(key, slots.length);
    return counts;
  }, [slotsByDay]);

  const bookMutation = useMutation({
    mutationFn: (startsAt: string): Promise<BookServiceResponse> =>
      bookService({
        serviceId: id,
        startsAt,
        // The seeker's zone: they are the one booking, and this is what the
        // booking row is stamped with. The screen never relies on it for
        // display — it prints both clocks explicitly.
        timezone: viewerTimeZone,
        seekerNote: note.trim() === '' ? undefined : note.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.bookings.all });
      // The slot is gone now; anything showing availability is stale.
      void queryClient.invalidateQueries({ queryKey: qk.services.all });
    },
    onError: (error) => {
      /*
       * A rejected slot means the picker was out of date. Drop the selection so
       * the user cannot hammer a time the server has already refused, and pull a
       * fresh list.
       *
       * The old rule here only did that for `validation` / `not_found`, i.e. the
       * 4xx codes. That left the single most important case uncovered. The
       * `bookings_no_provider_overlap` exclusion constraint (migration 0010) is
       * the *only* thing standing between two simultaneous seekers and a
       * double-booking, and when it fires `book-service` does
       * `if (bookingError) throw bookingError` on a raw Postgres error. That is
       * not an `ApiError`, so `errorResponse` turns SQLSTATE 23P01 into a
       * **500 internal_error**, which `kindForStatus` maps to `unknown` — so the
       * loser of the race kept a highlighted button for a slot the database had
       * already given away, over a slot list that was never refreshed. The one
       * moment the guard exists for was the one moment it did nothing.
       *
       * So: anything that is not a transport failure invalidates the pick. Only
       * `network` and `rate_limited` — where the request provably did not reach a
       * decision, or is explicitly invited to be retried — keep the selection.
       */
      const retryableTransport =
        isAppError(error) && (error.kind === 'network' || error.kind === 'rate_limited');
      if (retryableTransport) return;

      setSelectedStartsAt(null);
      void slotsQuery.refetch();
      /*
       * And refresh the seeker's own bookings. `book-service` inserts the row
       * *before* it talks to Stripe and does not undo it if that step throws
       * rather than rejects — a missing `STRIPE_SECRET_KEY` leaves a real,
       * `confirmed`, unpaid booking behind a 500. Verified live: the row
       * survives, the slot disappears from `available_slots`, and retrying the
       * same time answers "You already have booking ABC1234 at that time" for a
       * booking the seeker was never told about. Invalidating here at least puts
       * it in front of them on the Bookings tab, where it can be cancelled.
       */
      void queryClient.invalidateQueries({ queryKey: qk.bookings.all });
    },
  });

  /**
   * The booking row, fetched after creation purely for its snapshot of
   * `cancellation_window_hours`. CONVENTIONS §8: the window shown after a
   * purchase must come from the booking, never the service, because the service
   * can be edited afterwards and refund policy §2.3 says undisclosed terms are
   * not binding.
   */
  const bookingId = bookMutation.data?.booking_id ?? null;
  const bookingQuery = useQuery({
    queryKey: qk.bookings.detail(bookingId ?? 'pending'),
    queryFn: async () => (bookingId === null ? null : getBooking(bookingId)),
    enabled: bookingId !== null,
  });

  if (serviceQuery.isPending) {
    return (
      <Screen scroll safeBottom>
        <Skeleton height={180} radius="lg" />
        <Skeleton height={28} width="70%" style={styles.pendingLine} />
        <Skeleton height={16} width="45%" style={styles.pendingLine} />
        <Skeleton height={72} style={styles.pendingBlock} />
        <Skeleton height={120} style={styles.pendingBlock} />
      </Screen>
    );
  }

  if (serviceQuery.isError) {
    return (
      <Screen>
        <ErrorState error={serviceQuery.error} onRetry={() => void serviceQuery.refetch()} />
      </Screen>
    );
  }

  if (!service) {
    return (
      <Screen>
        <EmptyState
          icon="leaf-outline"
          title="Service not found"
          description="The practitioner may have taken it down. Others are still taking bookings."
          actionLabel="Find a practitioner"
          onAction={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  const provider = service.provider;
  const providerName = provider?.display_name ?? 'this practitioner';
  const providerTimeZone = provider?.timezone ?? viewerTimeZone;
  const crossZone = isCrossTimeZone(providerTimeZone, viewerTimeZone);

  // --- The result state replaces the whole form -------------------------------
  const result = bookMutation.data;
  if (result) {
    return (
      <>
        <Stack.Screen options={{ title: service.title }} />
        <Screen scroll safeBottom>
          <BookingResultPanel
            result={result}
            providerName={providerName}
            viewerTimeZone={viewerTimeZone}
            providerTimeZone={providerTimeZone}
            cancellationWindowHours={bookingQuery.data?.cancellation_window_hours ?? null}
            onViewBooking={() =>
              router.replace({
                pathname: '/(modal)/booking/[id]',
                params: { id: result.booking_id },
              })
            }
          />
        </Screen>
      </>
    );
  }

  // --- Derived selection ------------------------------------------------------
  // Derived rather than mirrored into state: when a refetch removes the slot
  // somebody else just took, the selection disappears with it instead of
  // leaving a highlighted button that no longer exists.
  const firstDayWithSlots = days.find((day) => (slotCountByDay.get(day.key) ?? 0) > 0)?.key ?? null;
  const activeDayKey = selectedDayKey ?? firstDayWithSlots;
  const activeSlots = activeDayKey === null ? [] : (slotsByDay.get(activeDayKey) ?? []);
  const selectedSlot = activeSlots.find((slot) => slot.startsAt === selectedStartsAt) ?? null;

  // Only counts days the strip actually offers. `slotCountByDay` can hold a
  // bucket outside the window — the RPC range is padded at each end to cover the
  // viewer/provider day-boundary mismatch — and treating that as "there are
  // times" would print "Choose a time below" over a fully disabled strip.
  const hasAnySlots = firstDayWithSlots !== null;
  const isInactive = !service.is_active;
  // `book-service` answers this with a 403. Better to never offer the button:
  // a practitioner previewing their own listing has no business seeing a price
  // and a "Book session" call to action.
  const isOwnService = viewerId !== null && viewerId === service.provider_id;

  const emptyReason = availabilityBlocker({
    details: providerDetailsQuery.data ?? null,
    ruleCount: rulesQuery.data?.length ?? null,
    providerName,
    viewerTimeZone,
  });
  // A hard blocker means no date in the strip can ever have a slot, so the strip,
  // the grid and the note field are all noise — and the action bar would be a
  // button that cannot succeed.
  const isBlocked = !hasAnySlots && emptyReason !== null;
  const hideBookingUi = isInactive || isOwnService || isBlocked;

  const priceLabel = formatMoney(service.price_cents, service.currency, { compact: true });
  const signedOut = viewerId === null;
  const buttonLabel = signedOut
    ? 'Log in to book'
    : service.requires_approval
      ? 'Request booking'
      : 'Book session';

  const barCaption = isInactive
    ? 'This service is not bookable'
    : signedOut
      ? 'Bookings are held against your account'
    : selectedSlot
      ? `${formatEventTime(selectedSlot.startsAt, viewerTimeZone)}${
          crossZone ? ` · ${formatEventClock(selectedSlot.startsAt, providerTimeZone)} for ${providerName}` : ''
        }`
      : hasAnySlots
        ? 'Choose a time below'
        : // Never claim there is nothing free on the strength of a query that
          // failed or has not answered. "No times" is a statement about the
          // practitioner's calendar, not about our network.
          slotsQuery.isError
          ? 'Could not load times'
          : slotsQuery.isPending
            ? 'Loading times…'
            : 'No times in the next two weeks';

  return (
    <>
      <Stack.Screen options={{ title: service.title }} />

      <Screen edgeToEdge>
        {/*
          `style={styles.flex}` matters: without it the ScrollView sizes to its
          content inside `Screen`'s column and pushes the action bar off-screen
          on a short service.
        */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.cover, { backgroundColor: theme.colors.surfaceMuted }]}>
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
              <Ionicons name="leaf-outline" size={40} color={theme.colors.textMuted} />
            )}
          </View>

          <View style={styles.body}>
            <Text variant="h2" heading={1}>
              {service.title}
            </Text>

            {provider ? (
              <Card
                variant="outlined"
                padding="sm"
                style={styles.providerCard}
                onPress={() => router.push({ pathname: '/(modal)/provider/[id]', params: { id: service.provider_id } })}
                accessibilityLabel={`With ${providerName}${
                  provider.is_verified ? ', verified' : ''
                }`}
                accessibilityHint="Opens the practitioner's profile"
              >
                <View style={styles.providerRow}>
                  <Avatar uri={provider.avatar_url} name={providerName} size="md" />
                  <View style={styles.providerText}>
                    <Text variant="caption" color="muted">
                      With
                    </Text>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {providerName}
                    </Text>
                  </View>
                  {provider.is_verified ? <Badge label="Verified" tone="success" /> : null}
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </View>
              </Card>
            ) : null}

            <View style={styles.facts}>
              <Fact icon="time-outline" text={formatDuration(service.duration_minutes)} />
              <Fact
                icon={deliveryModeIcon(service.delivery_mode)}
                text={deliveryModeLabel(service.delivery_mode)}
              />
              <Fact icon="pricetag-outline" text={formatMoney(service.price_cents, service.currency)} />
            </View>

            {service.description ? (
              <Text variant="body" color="secondary" style={styles.description}>
                {service.description}
              </Text>
            ) : null}

            {/*
              Stated before anything is booked, as a commitment rather than
              small print. This is the one place the window legitimately comes
              from the SERVICE: no booking exists yet, and this disclosure is
              exactly what `book-service` snapshots onto the row a moment later.
              Everywhere after this point it is read back off the booking.
            */}
            <Card variant="filled" padding="sm" style={styles.policy}>
              <View style={styles.policyRow}>
                {/*
                  `formatCancellationWindow(0)` reads "No free cancellation" —
                  a warning, not a reassurance. A green shield-and-tick beside it
                  turns the harshest possible term into what scans, at a glance,
                  as a guarantee. The glyph has to follow the sentence.
                */}
                <Ionicons
                  name={
                    service.cancellation_window_hours === 0
                      ? 'alert-circle-outline'
                      : 'shield-checkmark-outline'
                  }
                  size={20}
                  color={
                    service.cancellation_window_hours === 0
                      ? theme.colors.warning
                      : theme.colors.accent
                  }
                />
                <View style={styles.policyText}>
                  <Text variant="bodyStrong">
                    {formatCancellationWindow(service.cancellation_window_hours)}
                  </Text>
                  <Text variant="caption" color="muted">
                    These terms are locked to your booking when you confirm. Later edits to the
                    service do not change them.
                  </Text>
                </View>
              </View>
            </Card>

            {service.requires_approval ? (
              <Card variant="filled" padding="sm" style={styles.policy}>
                <View style={styles.policyRow}>
                  <Ionicons name="hourglass-outline" size={20} color={theme.colors.warning} />
                  <Text variant="bodySmall" color="secondary" style={styles.policyText}>
                    {`${providerName} approves each booking. Confirming sends a request — the time is not held as confirmed until they accept.`}
                  </Text>
                </View>
              </Card>
            ) : null}

            {/* --- Booking ---------------------------------------------------- */}
            <Text variant="h3" heading={2} style={styles.sectionHeading}>
              Pick a time
            </Text>

            {crossZone ? (
              <View style={[styles.zoneNote, { backgroundColor: theme.colors.accentSubtle }]}>
                <Ionicons name="globe-outline" size={16} color={theme.colors.accent} />
                <Text variant="bodySmall" color="accent" style={styles.zoneNoteText}>
                  {`Times are shown in your timezone (${viewerTimeZone}). ${providerName} is in ${providerTimeZone}.`}
                </Text>
              </View>
            ) : null}

            {isInactive ? (
              <EmptyState
                icon="pause-circle-outline"
                title="Not taking bookings"
                description="The practitioner has paused this service. Their profile may have others."
                actionLabel="See their profile"
                onAction={() => router.push({ pathname: '/(modal)/provider/[id]', params: { id: service.provider_id } })}
              />
            ) : isOwnService ? (
              <EmptyState
                icon="person-circle-outline"
                title="This is your service"
                description="You are looking at your own listing. This is what a seeker sees before they book."
              />
            ) : isBlocked && emptyReason ? (
              <EmptyState
                icon={emptyReason.icon}
                title={emptyReason.title}
                description={emptyReason.description}
                actionLabel="See their profile"
                onAction={() => router.push({ pathname: '/(modal)/provider/[id]', params: { id: service.provider_id } })}
              />
            ) : (
              <>
                <DateStrip
                  days={days}
                  selectedKey={activeDayKey}
                  onSelect={(key) => {
                    setSelectedDayKey(key);
                    setSelectedStartsAt(null);
                  }}
                  slotCountByDay={slotCountByDay}
                  loading={slotsQuery.isPending}
                />

                <View style={styles.slots}>
                  <SlotPicker
                    slots={activeSlots}
                    selectedStartsAt={selectedStartsAt}
                    onSelect={(slot) => setSelectedStartsAt(slot.startsAt)}
                    viewerTimeZone={viewerTimeZone}
                    providerTimeZone={providerTimeZone}
                    isPending={slotsQuery.isPending}
                    isError={slotsQuery.isError}
                    error={slotsQuery.error}
                    onRetry={() => void slotsQuery.refetch()}
                    // "No times on this day" is only true when a day is
                    // selected. With an entirely empty two weeks there is no
                    // selected day — `activeDayKey` is null — and the old title
                    // pointed at a day that was not highlighted anywhere.
                    emptyTitle={hasAnySlots ? undefined : 'Fully booked'}
                    emptyDescription={
                      hasAnySlots
                        ? 'Try another date — the strip above marks the days with openings.'
                        : `${providerName} works these weeks but has nothing free in them. Message them to ask about later dates.`
                    }
                  />
                </View>

                <Input
                  label="Note to the practitioner"
                  hint="Optional. What you would like from the session, anything they should know."
                  value={note}
                  onChangeText={setNote}
                  multiline
                  maxLength={NOTE_MAX_LENGTH}
                  placeholder="Optional"
                  containerStyle={styles.note}
                />
              </>
            )}
          </View>
        </ScrollView>

        {hideBookingUi ? null : (
          <BookingActionBar
            priceLabel={priceLabel}
            caption={barCaption}
            buttonLabel={buttonLabel}
            onPress={() => {
              if (signedOut) {
                signInThen(router, `/service/${service.id}`);
                return;
              }
              if (selectedSlot) bookMutation.mutate(selectedSlot.startsAt);
            }}
            // Signed out the button needs no slot chosen — its job is the
            // account, and the time can be picked afterwards.
            disabled={signedOut ? false : selectedSlot === null || slotsQuery.isPending}
            loading={bookMutation.isPending}
            error={bookingErrorMessage(bookMutation.error)}
            accessibilityHint={
              service.requires_approval
                ? 'Sends a booking request. The practitioner has to accept it.'
                : `Books this time. ${formatCancellationWindow(service.cancellation_window_hours)}.`
            }
          />
        )}
      </Screen>
    </>
  );
}

interface AvailabilityBlocker {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}

/**
 * Why the slot list is empty, when the reason is something other than a full
 * calendar.
 *
 * Returns `null` when the practitioner is genuinely open for business — then an
 * empty slot list means "booked solid for a fortnight", which is a different
 * sentence and a different suggestion.
 *
 * The three cases mirror the conflicts `book-service` raises
 * (`provider_not_accepting`, `provider_out_of_office`, `no_availability_published`),
 * so what the picker says up front and what the server would say at confirm time
 * are the same story.
 */
function availabilityBlocker(input: {
  details: { accepts_bookings: boolean; is_out_of_office: boolean; out_of_office_until: string | null } | null;
  /** `null` while the rules query is still in flight — do not conclude anything yet. */
  ruleCount: number | null;
  providerName: string;
  viewerTimeZone: string;
}): AvailabilityBlocker | null {
  const { details, ruleCount, providerName, viewerTimeZone } = input;

  if (details && !details.accepts_bookings) {
    return {
      icon: 'pause-circle-outline',
      title: 'Not accepting bookings',
      description: `${providerName} has paused new bookings. Their profile has a message button if you want to ask when that changes.`,
    };
  }

  if (details?.is_out_of_office) {
    const until = details.out_of_office_until;
    return {
      icon: 'airplane-outline',
      title: 'Away right now',
      description: until
        ? // `out_of_office_until` is a bare date. Anchored at noon UTC before
          // formatting so it cannot slide onto the previous day for a viewer
          // west of Greenwich.
          `${providerName} is away until ${formatEventDate(`${until}T12:00:00Z`, viewerTimeZone)}. Nothing can be booked before then.`
        : `${providerName} is away and has not said when they are back.`,
    };
  }

  if (ruleCount === 0) {
    return {
      icon: 'calendar-clear-outline',
      title: 'No hours published',
      description: `${providerName} has not published any working hours yet, so there is nothing to book against. Message them to arrange a time.`,
    };
  }

  return null;
}

/**
 * Turns a failed `book-service` call into one line for the action bar.
 *
 * The Edge Function answers a lost race with **409**, which `functions.ts` maps
 * onto `AppError` kind `validation` (409, 422 and 400 all land there). Its own
 * message is written for a person, so it is preferred when it clearly describes
 * a taken slot; otherwise the generic line is used, because "that time was just
 * taken" would be a wrong explanation of, say, a rejected note length.
 *
 * Must stay in step with the `onError` handler above: every branch that clears
 * the selection says so, because a highlighted button silently going grey with
 * no explanation is worse than the error itself.
 */
function bookingErrorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  if (!isAppError(error)) {
    return 'Something went wrong. We have refreshed the times — please pick one again.';
  }

  // The two that keep the selection. No mention of refreshed times, because
  // nothing was refreshed and the pick is still good.
  if (error.kind === 'network' || error.kind === 'rate_limited') return error.message;

  if (error.kind === 'validation' || error.kind === 'not_found') {
    const haystack = `${error.code ?? ''} ${error.message}`.toLowerCase();
    const looksLikeAConflict =
      /slot|taken|no longer|unavailable|not available|already booked|overlap|conflict|busy/.test(
        haystack,
      );
    return looksLikeAConflict
      ? 'That time was just taken. We have refreshed the times — please pick another.'
      : `${error.message} The times have been refreshed.`;
  }

  /*
   * Everything else, which is where a lost exclusion-constraint race lands:
   * `book-service` rethrows SQLSTATE 23P01 raw, so it arrives as a 500 with the
   * message "The function failed unexpectedly." That sentence on its own is
   * both frightening and useless next to a booking, and it does not explain why
   * the chosen time just went grey. Say what happened and what to do; keep the
   * server's text out of it.
   */
  return 'We could not confirm that time. We have refreshed the times — please pick one again, and check your bookings before retrying.';
}

function Fact({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.fact} accessible accessibilityLabel={text}>
      <Ionicons name={icon} size={16} color={theme.colors.textMuted} />
      <Text variant="bodySmall" color="secondary">
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    paddingBottom: spacing.xxl,
  },
  cover: {
    width: '100%',
    aspectRatio: aspectRatios.landscape,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  body: {
    paddingHorizontal: SCREEN_GUTTER,
    paddingTop: spacing.md,
  },
  providerCard: {
    marginTop: spacing.sm,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  providerText: {
    flex: 1,
  },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  description: {
    marginTop: spacing.md,
  },
  policy: {
    marginTop: spacing.md,
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  policyText: {
    flex: 1,
    gap: 2,
  },
  sectionHeading: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  zoneNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xxs,
    padding: spacing.sm,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
  },
  zoneNoteText: {
    flex: 1,
  },
  slots: {
    marginTop: spacing.md,
  },
  note: {
    marginTop: spacing.lg,
  },
  pendingLine: {
    marginTop: spacing.xs,
  },
  pendingBlock: {
    marginTop: spacing.lg,
  },
});
