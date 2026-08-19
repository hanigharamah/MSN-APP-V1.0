import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { InlineError, SectionCard } from '@/components/events';
import { buildDayOptions, groupSlotsByDay, rpcDateRange } from '@/components/providers';
import { Chip, Skeleton, Text } from '@/components/ui';
import { deviceTimeZone, formatDuration, formatEventClock } from '@/lib/format';
import { qk } from '@/lib/queries/keys';
import { getProviderDetails } from '@/lib/queries/profiles';
import {
  getAvailableSlots,
  listServicesByProvider,
  type TimeSlot,
} from '@/lib/queries/services';
import { borderWidths, radii, spacing, useTheme } from '@/theme';
import type { Service } from '@/types/database';

export interface SlotPreviewSectionProps {
  providerId: string;
  /** How many rules are actually published. Drives the "why is this empty" copy. */
  publishedRuleCount: number;
  /** True when the weekly card has edits that have not been written yet. */
  hasUnsavedHours: boolean;
  /**
   * Pin the preview to one service and drop the picker.
   *
   * Set this when the card is rendered INSIDE that service's editor. A row of
   * chips offering to preview a different service is noise there — you already
   * chose one by opening it — and picking another would silently show times
   * for something you are not editing.
   *
   * Leave undefined for a provider-wide view, where choosing is the point.
   */
  pinnedServiceId?: string;
}

/**
 * What a seeker is actually offered.
 *
 * Rules are abstract; slots are not. This card runs the real
 * `available_slots(provider, service, from_date, to_date)` RPC — the same
 * function the service screen's picker calls and the same one `book-service`
 * re-checks against — so what appears here is not a simulation of the booking
 * flow, it *is* the booking flow's answer.
 *
 * Three things it can show that the rules above cannot:
 *
 * - **Spacing comes from the service.** Candidate starts are cut every
 *   `duration_minutes + buffer_minutes`, so a 60-minute service with a
 *   15-minute buffer starts on the hour, then 1:15, then 2:30 — never on a grid
 *   the weekly hours chose.
 * - **Bookings and time off have already been subtracted**, the bookings widened
 *   by that same buffer on both sides.
 * - **Both master switches are applied.** Not accepting, or away, means zero
 *   slots however complete the week above looks.
 */
export function SlotPreviewSection({
  providerId,
  publishedRuleCount,
  hasUnsavedHours,
  pinnedServiceId,
}: SlotPreviewSectionProps) {
  const theme = useTheme();
  const viewerZone = useMemo(() => deviceTimeZone(), []);
  const days = useMemo(() => buildDayOptions(viewerZone), [viewerZone]);
  const range = useMemo(() => rpcDateRange(viewerZone), [viewerZone]);

  const [serviceId, setServiceId] = useState<string | null>(null);

  const servicesQuery = useQuery({
    queryKey: qk.services.byProvider(providerId),
    queryFn: () => listServicesByProvider(providerId),
    enabled: providerId.length > 0,
  });

  // `listServicesByProvider` already filters to `is_active`, which matches
  // `available_slots` — it joins on `s.is_active`, so an inactive service has no
  // slots by definition and previewing one would only ever show zero.
  const services = servicesQuery.data ?? [];
  // Pinned wins outright. Falling back to `services[0]` when the pinned id is
  // absent would preview a DIFFERENT service under this service's heading —
  // which happens whenever the one being edited is inactive, since
  // `listServicesByProvider` filters those out. Better to show nothing and let
  // the empty copy explain than to show convincing times for the wrong thing.
  const selected: Service | null = pinnedServiceId
    ? (services.find((service) => service.id === pinnedServiceId) ?? null)
    : (services.find((service) => service.id === serviceId) ?? services[0] ?? null);

  // Shares the profile screen's cache entry, so this is free once that has run.
  const detailsQuery = useQuery({
    queryKey: qk.profiles.providerDetails(providerId),
    queryFn: () => getProviderDetails(providerId),
    enabled: providerId.length > 0,
  });

  /**
   * Same key shape as `(modal)/service/[id].tsx`: the availability key with the
   * service appended. Two services from one provider have different durations
   * and buffers and therefore different slots, but both belong under the
   * `['services']` prefix so a save above invalidates them together.
   */
  const slotsQuery = useQuery({
    queryKey: [
      ...qk.services.availability(providerId, range.fromDate, range.toDate),
      selected?.id ?? 'none',
    ] as const,
    queryFn: async (): Promise<TimeSlot[]> => {
      if (selected === null) return [];
      return getAvailableSlots({
        serviceId: selected.id,
        providerId,
        fromDate: range.fromDate,
        toDate: range.toDate,
      });
    },
    enabled: selected !== null,
    staleTime: 15_000,
  });

  const slotsByDay = useMemo(
    () => groupSlotsByDay(slotsQuery.data ?? [], viewerZone),
    [slotsQuery.data, viewerZone],
  );

  const visibleDays = days.filter((day) => (slotsByDay.get(day.key)?.length ?? 0) > 0);
  const total = visibleDays.reduce((sum, day) => sum + (slotsByDay.get(day.key)?.length ?? 0), 0);

  return (
    <SectionCard title="What a seeker sees">
      <Text variant="bodySmall" color="secondary" style={styles.intro}>
        The real answer from <Text variant="bodySmall" color="accent">available_slots</Text>, for the
        next {days.length} days. This is what the booking screen offers.
      </Text>

      {hasUnsavedHours ? (
        <View style={[styles.notice, { backgroundColor: theme.colors.warningSubtle }]}>
          <Text variant="bodySmall" color="warning">
            You have unsaved changes to your weekly hours. This preview is built from what is
            published, not from what is on screen above — save to see the difference.
          </Text>
        </View>
      ) : null}

      {servicesQuery.isPending ? (
        <Skeleton height={36} radius="pill" />
      ) : servicesQuery.isError ? (
        <InlineError error={servicesQuery.error} onRetry={() => void servicesQuery.refetch()} />
      ) : services.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: theme.colors.surfaceMuted }]}>
          <Text variant="bodySmall" color="secondary">
            You have no active services, so there is nothing to preview. Slots are cut from your
            hours by a service&apos;s duration — without one, the hours have no length to divide
            into.
          </Text>
        </View>
      ) : (
        <>
          {/* No `radiogroup` role: `Chip` announces as a checkbox by design
              (CONVENTIONS §6), and wrapping checkboxes in a radio group tells a
              screen reader something the children then contradict. */}
          {pinnedServiceId ? null : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {services.map((service) => (
                <Chip
                  key={service.id}
                  label={service.title}
                  selected={service.id === selected?.id}
                  onPress={() => setServiceId(service.id)}
                  accessibilityHint={`Preview times for ${service.title}, ${formatDuration(service.duration_minutes)}`}
                />
              ))}
            </ScrollView>
          )}

          {selected === null ? null : (
            <ServiceMechanics service={selected} pinned={Boolean(pinnedServiceId)} />
          )}

          {slotsQuery.isPending ? (
            <View style={styles.skeletons} accessibilityLiveRegion="polite">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} height={72} radius="lg" />
              ))}
            </View>
          ) : slotsQuery.isError ? (
            <InlineError error={slotsQuery.error} onRetry={() => void slotsQuery.refetch()} />
          ) : total === 0 ? (
            <EmptyDiagnosis
              publishedRuleCount={publishedRuleCount}
              acceptsBookings={detailsQuery.data?.accepts_bookings ?? true}
              isOutOfOffice={detailsQuery.data?.is_out_of_office ?? false}
              days={days.length}
            />
          ) : (
            <>
              <Text variant="bodyStrong" style={styles.headline} accessibilityLiveRegion="polite">
                {total} bookable {total === 1 ? 'time' : 'times'} across {visibleDays.length}{' '}
                {visibleDays.length === 1 ? 'day' : 'days'}
              </Text>

              <View style={styles.days}>
                {visibleDays.map((day) => {
                  const slots = slotsByDay.get(day.key) ?? [];

                  return (
                    <View
                      key={day.key}
                      style={[
                        styles.day,
                        {
                          borderTopColor: theme.colors.border,
                          borderTopWidth: borderWidths.hairline,
                        },
                      ]}
                    >
                      <Text variant="label" color="secondary">
                        {day.isToday ? 'Today' : `${day.weekday} ${day.dayOfMonth} ${day.month}`} ·{' '}
                        {slots.length} {slots.length === 1 ? 'time' : 'times'}
                      </Text>
                      <View style={styles.slots}>
                        {slots.map((slot) => (
                          <View
                            key={slot.startsAt}
                            style={[
                              styles.slot,
                              {
                                backgroundColor: theme.colors.accentSubtle,
                                borderRadius: radii.sm,
                              },
                            ]}
                          >
                            <Text variant="caption" color="accent">
                              {formatEventClock(slot.startsAt, viewerZone)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>

              <Text variant="caption" color="muted" style={styles.footnote}>
                Shown on your clock ({viewerZone}). A seeker elsewhere sees these same moments on
                theirs — the slots are instants, not wall-clock times, which is why the zone on each
                weekly window matters.
                {visibleDays.length < days.length
                  ? ` ${days.length - visibleDays.length} of the next ${days.length} days have nothing free.`
                  : ''}
              </Text>
            </>
          )}
        </>
      )}
    </SectionCard>
  );
}

/** Where the spacing between start times comes from — and where it does not. */
function ServiceMechanics({ service, pinned }: { service: Service; pinned: boolean }) {
  const theme = useTheme();
  const step = service.duration_minutes + service.buffer_minutes;

  return (
    <View style={[styles.mechanics, { backgroundColor: theme.colors.surfaceMuted }]}>
      <Text variant="bodySmall">
        {formatDuration(service.duration_minutes)} per session
        {service.buffer_minutes > 0
          ? `, plus a ${service.buffer_minutes}-minute buffer`
          : ', with no buffer'}
        . Start times inside your hours are cut every {formatDuration(step)}.
      </Text>
      <Text variant="caption" color="muted">
        {/* Pinned means this card is inside the service editor, where "both
            numbers live on the service, not here" would be simply false —
            they are on the form directly above. That sentence existed to send
            you somewhere else; there is nowhere else to send you now. */}
        {pinned
          ? 'Both numbers come from the length and buffer set above. '
          : 'Both numbers live on the service, not here. '}
        The buffer also widens every existing booking by {service.buffer_minutes}{' '}
        {service.buffer_minutes === 1 ? 'minute' : 'minutes'} on each side when times are removed.
        {pinned
          ? ' Changing your hours below will not change the spacing.'
          : ' Editing your hours will not change the spacing — edit the service for that.'}
      </Text>
    </View>
  );
}

interface EmptyDiagnosisProps {
  publishedRuleCount: number;
  acceptsBookings: boolean;
  isOutOfOffice: boolean;
  days: number;
}

/**
 * Why there are no slots.
 *
 * `available_slots` returns an empty set for several unrelated reasons and
 * cannot distinguish them — it returns timestamps and nothing else. From the
 * provider's own side every input is visible, so the screen can say which one it
 * is instead of showing the same shrug four times.
 */
function EmptyDiagnosis({
  publishedRuleCount,
  acceptsBookings,
  isOutOfOffice,
  days,
}: EmptyDiagnosisProps) {
  const theme = useTheme();

  const reason = !acceptsBookings
    ? 'You are not accepting bookings. Nothing is generated while that switch is off, and a booking attempt is refused outright even if someone reaches the confirm step with an old link.'
    : isOutOfOffice
      ? 'You are marked out of office. Every time inside the away period is dropped, and a booking attempt is refused with a message saying you are away.'
      : publishedRuleCount === 0
        ? 'You have no published weekly hours. Add a window above and save — until then there is nothing for a session to be cut out of.'
        : `Your hours are published, but every time in the next ${days} days is already taken, blocked, or too short for this service to fit before the window closes.`;

  return (
    <View
      style={[styles.empty, { backgroundColor: theme.colors.warningSubtle }]}
      accessibilityLiveRegion="polite"
    >
      <Text variant="bodyStrong" color="warning">
        Nobody can book you right now.
      </Text>
      <Text variant="bodySmall" color="warning">
        {reason}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  mechanics: {
    gap: spacing.xxs,
    padding: spacing.sm,
    borderRadius: radii.lg,
    marginTop: spacing.sm,
  },
  skeletons: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  headline: {
    marginTop: spacing.md,
  },
  days: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  day: {
    gap: spacing.xxs,
    paddingTop: spacing.xs,
  },
  slots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
  slot: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  empty: {
    gap: spacing.xxs,
    padding: spacing.sm,
    borderRadius: radii.lg,
    marginTop: spacing.sm,
  },
  notice: {
    padding: spacing.sm,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
  },
  footnote: {
    marginTop: spacing.sm,
  },
});
