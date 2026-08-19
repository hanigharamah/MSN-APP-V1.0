import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import {
  NoticeCard,
  ServiceForm,
  draftFromService,
  toUpdate,
  type ServiceValues,
} from '@/components/provider-tools/services';
import {
  SlotPreviewSection,
  TimeOffSection,
  WeeklyHoursSection,
  useWeeklyHours,
} from '@/components/provider-tools/availability';
import { EmptyState, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { deviceTimeZone } from '@/lib/format';
import { qk } from '@/lib/queries/keys';
import { getService, updateService } from '@/lib/queries/services';
import { spacing } from '@/theme';

/**
 * Edit a service.
 *
 * `getService` is used rather than the list query because it does not filter on
 * `is_active` — a paused service has to be openable, or it could never be
 * edited back into shape.
 *
 * The form is mounted with `key={service.id}` and reads its initial draft once.
 * A background refetch therefore cannot overwrite half-typed text, and opening
 * a different service still starts from that service's values rather than
 * inheriting the last one's draft.
 */
export default function EditServiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, profile } = useAuth();
  const viewerId = session?.user.id ?? null;

  // Hours belong to the practitioner, so they key on the signed-in user rather
  // than on the service being edited.
  const providerId = session?.user.id ?? '';
  const weekly = useWeeklyHours(providerId);
  // `profiles.timezone` is only ever the default for a NEW window — the zone
  // itself lives on each rule.
  const defaultTimeZone = profile?.timezone || deviceTimeZone();

  const query = useQuery({
    queryKey: qk.services.detail(id),
    queryFn: () => getService(id),
    enabled: Boolean(id),
  });

  const save = useMutation({
    mutationFn: (values: ServiceValues) => updateService(id, toUpdate(values)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.services.all });
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/listings');
    },
  });

  if (query.isPending) {
    return (
      <>
        <Stack.Screen options={{ title: 'Service' }} />
        <Screen scroll safeBottom>
          <Skeleton height={20} width="35%" />
          <Skeleton height={72} style={styles.skeletonBlock} />
          <Skeleton height={72} style={styles.skeletonBlock} />
          <Skeleton height={180} style={styles.skeletonBlock} />
          <Skeleton height={72} style={styles.skeletonBlock} />
        </Screen>
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Service' }} />
        <Screen>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Screen>
      </>
    );
  }

  const service = query.data;

  if (!service) {
    return (
      <>
        <Stack.Screen options={{ title: 'Service' }} />
        <Screen>
          <EmptyState
            icon="leaf-outline"
            title="Service not found"
            description="It may have been removed. Everything else you offer is in Listings."
            actionLabel="Back to Listings"
            onAction={() => router.replace('/(tabs)/listings')}
          />
        </Screen>
      </>
    );
  }

  /*
   * Somebody else's service. Reachable — `getService` has no owner filter and
   * RLS publishes every active service — so this is a real branch, not a
   * defensive one. `providers manage own services` would refuse the UPDATE,
   * but a form that saves nothing is a worse answer than not offering one.
   */
  if (viewerId !== null && service.provider_id !== viewerId) {
    return (
      <>
        <Stack.Screen options={{ title: 'Service' }} />
        <Screen>
          <EmptyState
            icon="lock-closed-outline"
            title="Not your service"
            description="This one belongs to another practitioner, so it cannot be edited here."
            actionLabel="Back to Listings"
            onAction={() => router.replace('/(tabs)/listings')}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: service.title }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Screen scroll safeBottom>
          {service.is_active ? null : (
            <View style={styles.banner}>
              <NoticeCard
                tone="warning"
                icon="pause-circle-outline"
                title="Not offered right now"
                body="Nobody can see or book this service. Edits save normally; switch it back on from Listings when you want it offered again."
              />
            </View>
          )}

          <ServiceForm
            key={service.id}
            initial={draftFromService(service)}
            submitLabel="Save changes"
            submitting={save.isPending}
            error={save.error}
            onSubmit={(values) => save.mutate(values)}
            onEdit={() => {
              if (save.isError) save.reset();
            }}
          />

          {/* --- When people can book this ------------------------------- */}
          {/* Availability used to be its own top-level screen, a sibling of
              services and events. It only ever affected services, so for a
              host who runs events alone it was a menu item that did nothing —
              and it had to keep explaining that the numbers shaping it
              (duration, buffer) lived on the service rather than on itself.
              It belongs next to the thing it governs. See
              docs/spec-listings.md §4.4.

              The hours are still stored per PRACTITIONER
              (`availability_rules.provider_id`), not per service, so the
              heading says so outright. Showing them inside one service without
              that sentence would imply editing them here affects only this
              service, which is the one wrong idea this section could plant. */}
          <View style={styles.hours}>
            <Text variant="h4" heading={2}>
              Your booking hours
            </Text>
            <Text variant="bodySmall" color="secondary">
              These hours apply to every session you offer, not just this one.
              How far apart the start times fall comes from this service&apos;s
              own length and buffer, set above.
            </Text>

            <SlotPreviewSection
              providerId={providerId}
              pinnedServiceId={service.id}
              publishedRuleCount={weekly.published?.length ?? 0}
              hasUnsavedHours={weekly.isDirty}
            />

            <WeeklyHoursSection weekly={weekly} defaultTimeZone={defaultTimeZone} />

            <TimeOffSection providerId={providerId} defaultTimeZone={defaultTimeZone} />
          </View>
        </Screen>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  banner: {
    marginBottom: spacing.md,
  },
  hours: {
    gap: spacing.md,
    marginTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  skeletonBlock: {
    marginTop: spacing.md,
  },
});
