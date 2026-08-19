import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { InlineError, SectionCard } from '@/components/events';
import { Badge, Skeleton, Text } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { deviceTimeZone, formatEventTime } from '@/lib/format';
import { qk } from '@/lib/queries/keys';
import { getProviderDetails, upsertProviderDetails } from '@/lib/queries/profiles';
import { radii, spacing, useTheme } from '@/theme';
import { dateOptions } from './availability-model';
import { FieldButton } from './FieldButton';
import { OptionListSheet, type SheetOption } from './OptionListSheet';
import { ToggleRow } from './ToggleRow';

const NO_END_DATE = 'none';
const CALENDAR_DAYS = 366;

export interface BookingStatusSectionProps {
  providerId: string;
}

interface StatusValues {
  accepts_bookings: boolean;
  is_out_of_office: boolean;
  out_of_office_until: string | null;
}

/**
 * The two master switches, and what they actually cost.
 *
 * Both are checked twice — once by `available_slots`, which stops generating
 * slots, and again by the `book-service` Edge Function, which refuses with a
 * named code (`provider_not_accepting`, `provider_out_of_office`) even if a
 * seeker somehow reaches it with a stale slot. There is no version of this that
 * quietly does nothing, which is why each toggle says its consequence in full.
 *
 * ## `out_of_office_until` is a UTC date, and inclusive
 *
 * `available_slots` excludes a slot when
 * `(slot_start at time zone 'UTC')::date <= out_of_office_until`, and
 * `book-service` refuses anything at or before `until` + `T23:59:59Z`. Both mean
 * "away through the end of that day, UTC" — which for a practitioner far from
 * Greenwich is not the end of *their* day. The card works out the first moment
 * they are bookable again and prints it on their own clock, because "back on the
 * 21st" is otherwise wrong by up to half a day in either direction.
 */
export function BookingStatusSection({ providerId }: BookingStatusSectionProps) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [pickingDate, setPickingDate] = useState(false);
  const viewerZone = deviceTimeZone();

  const detailsKey = qk.profiles.providerDetails(providerId);

  const query = useQuery({
    queryKey: detailsKey,
    queryFn: () => getProviderDetails(providerId),
    enabled: providerId.length > 0,
  });

  const save = useMutation({
    mutationFn: (values: StatusValues) => upsertProviderDetails(providerId, values),
    onSuccess: (saved) => {
      queryClient.setQueryData(detailsKey, saved);
      // Slots depend on both flags.
      void queryClient.invalidateQueries({ queryKey: qk.services.all });
    },
  });

  // No row yet is a legitimate state — `provider_details` is created lazily —
  // and it means the schema defaults apply: taking bookings, not away.
  const values: StatusValues = {
    accepts_bookings: query.data?.accepts_bookings ?? true,
    is_out_of_office: query.data?.is_out_of_office ?? false,
    out_of_office_until: query.data?.out_of_office_until ?? null,
  };

  const dates = useMemo<SheetOption[]>(
    () => [
      { value: NO_END_DATE, label: 'No end date', detail: 'Away until you switch it back off' },
      // Plain calendar dates: the column is a `date` and both checks read it in
      // UTC, so listing it in a local zone would offer a day that means a
      // different day to the database.
      ...dateOptions('UTC', CALENDAR_DAYS).map((day) => ({
        value: day.key,
        label: day.label,
        detail: 'UTC',
      })),
    ],
    [],
  );

  function update(patch: Partial<StatusValues>) {
    save.mutate({ ...values, ...patch });
  }

  if (query.isPending) {
    return (
      <SectionCard title="Taking bookings">
        <View style={styles.skeletons} accessibilityLiveRegion="polite">
          <Skeleton height={56} radius="lg" />
          <Skeleton height={56} radius="lg" />
        </View>
      </SectionCard>
    );
  }

  if (query.isError) {
    return (
      <SectionCard title="Taking bookings">
        <InlineError error={query.error} onRetry={() => void query.refetch()} />
      </SectionCard>
    );
  }

  const blocked = !values.accepts_bookings || values.is_out_of_office;

  return (
    <SectionCard
      title="Taking bookings"
      accessory={
        <Badge
          label={blocked ? 'Not bookable' : 'Bookable'}
          tone={blocked ? 'danger' : 'success'}
        />
      }
    >
      <ToggleRow
        label="Accepting bookings"
        description="Off means nobody can book you at all — no times are generated, and a booking attempt is refused outright. Your hours below are kept."
        value={values.accepts_bookings}
        onValueChange={(next) => update({ accepts_bookings: next })}
        busy={save.isPending}
        testID="availability-accepts-bookings"
      />

      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      <ToggleRow
        label="Out of office"
        description="A temporary away flag. Same effect while it is on, but you can give it an end date."
        value={values.is_out_of_office}
        onValueChange={(next) =>
          update({
            is_out_of_office: next,
            // Turning it off clears the date too. Leaving a stale "until" behind
            // means the next time it is switched on it silently expires on a
            // day chosen months ago.
            ...(next ? {} : { out_of_office_until: null }),
          })
        }
        busy={save.isPending}
        testID="availability-out-of-office"
      />

      {values.is_out_of_office ? (
        <View style={styles.away}>
          <FieldButton
            label="Away until"
            value={values.out_of_office_until ?? 'No end date'}
            icon="airplane-outline"
            onPress={() => setPickingDate(true)}
            disabled={save.isPending}
          />
          <ReturnNote until={values.out_of_office_until} viewerZone={viewerZone} />
        </View>
      ) : null}

      {save.isError ? (
        <View
          style={[styles.notice, { backgroundColor: theme.colors.dangerSubtle }]}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text variant="bodySmall" color="danger">
            {errorMessage(save.error)} Nothing changed — the switch is showing what is actually
            saved.
          </Text>
        </View>
      ) : null}

      {blocked ? (
        <View style={[styles.notice, { backgroundColor: theme.colors.warningSubtle }]}>
          <Text variant="bodySmall" color="warning">
            While this is on, the preview below will be empty however good your hours are. Bookings
            already in your calendar are unaffected — neither switch cancels anything.
          </Text>
        </View>
      ) : null}

      <OptionListSheet
        visible={pickingDate}
        title="Away until"
        description="The last day you are away, counted in UTC. You are bookable again the day after."
        options={dates}
        selected={values.out_of_office_until ?? NO_END_DATE}
        onSelect={(value) =>
          update({ out_of_office_until: value === NO_END_DATE ? null : value })
        }
        onClose={() => setPickingDate(false)}
        searchable
        searchPlaceholder="Search dates"
      />
    </SectionCard>
  );
}

function ReturnNote({ until, viewerZone }: { until: string | null; viewerZone: string }) {
  if (until === null) {
    return (
      <Text variant="caption" color="muted">
        No end date, so you stay away until you turn this off. Seekers are told you are currently
        away, without a date.
      </Text>
    );
  }

  const back = firstBookableInstant(until);
  if (back === null) {
    return (
      <Text variant="caption" color="muted">
        Away through {until}, counted in UTC.
      </Text>
    );
  }

  return (
    <Text variant="caption" color="muted">
      Away through the end of {until} in UTC. The first time you can be offered again is{' '}
      {formatEventTime(back.toISOString(), viewerZone)} on your clock ({viewerZone}) — the column is
      a UTC date, so it does not land at midnight where you are unless you are on GMT.
    </Text>
  );
}

/** Midnight UTC on the day after `until` — the first instant not excluded. */
function firstBookableInstant(until: string): Date | null {
  const parts = until.split('-');
  const year = Number.parseInt(parts[0] ?? '', 10);
  const month = Number.parseInt(parts[1] ?? '', 10);
  const day = Number.parseInt(parts[2] ?? '', 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
}

const styles = StyleSheet.create({
  skeletons: {
    gap: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
  },
  away: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  notice: {
    padding: spacing.sm,
    borderRadius: radii.lg,
    marginTop: spacing.sm,
  },
});
