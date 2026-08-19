import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormError } from '@/components/auth/FormError';
import {
  EventFormFields,
  NoticeCard,
  defaultEventWindow,
  emptyEventDraft,
  eventDraftToInsert,
  hasEventDraftErrors,
  validateEventDraft,
  type EventDraft,
} from '@/components/provider-tools/events';
import { Button, Screen, Text } from '@/components/ui';
import { useRequiredUserId } from '@/context/AuthContext';
import { createEvent, listCategories } from '@/lib/queries/events';
import { qk } from '@/lib/queries/keys';
import { spacing } from '@/theme';

/**
 * Create an event.
 *
 * Always creates a **draft**. `status` is left at its default and
 * `published_at` is never written here, because
 * `events_published_has_timestamp` requires the two to move in one statement —
 * so going live is an action on the edit screen, after the ticket tiers exist.
 * That ordering is not bureaucracy: an event published with no tiers is
 * visible and unbuyable, which is the worst of both.
 *
 * `events_online_needs_link` exempts drafts, so a joining link is not required
 * here. The publish checklist is where it becomes mandatory.
 */
export default function NewEventScreen() {
  const hostId = useRequiredUserId();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<EventDraft>(() => emptyEventDraft(defaultEventWindow()));
  const [submitted, setSubmitted] = useState(false);

  // A failed category list is not a failed screen: every other field still
  // works and `category_id` is nullable.
  const categories = useQuery({
    queryKey: qk.categories.list,
    queryFn: listCategories,
  });

  const create = useMutation({
    mutationFn: () => createEvent(eventDraftToInsert(draft, hostId)),
    onSuccess: async (event) => {
      await queryClient.invalidateQueries({ queryKey: qk.events.all });
      // Replaced, not pushed: backing out of a saved event onto the empty form
      // that created it invites a second copy of the same event.
      router.replace(`/(provider)/events/${event.id}`);
    },
  });

  const errors = validateEventDraft(draft);

  function handleCreate() {
    setSubmitted(true);
    if (hasEventDraftErrors(errors)) return;
    create.mutate();
  }

  return (
    <Screen scroll safeBottom>
      <Stack.Screen options={{ title: 'New event' }} />

      {/* No `KeyboardAvoidingView`: `Screen scroll` is already a ScrollView,
          and nesting one inside the other collapses the content height on
          Android. The scroll view brings the focused field into view. */}
      <View style={styles.stack}>
          <Text variant="h2" heading={1}>
            New event
          </Text>

          {create.isError ? <FormError error={create.error} /> : null}

          <NoticeCard
            tone="info"
            title="This saves as a draft"
            body="Nothing is public until you publish it, and publishing needs at least one ticket tier. You can change every field afterwards."
          />

          <EventFormFields
            draft={draft}
            onChange={(next) => {
              setDraft(next);
              if (create.isError) create.reset();
            }}
            errors={errors}
            showErrors={submitted}
            categories={categories.data ?? []}
            categoriesUnavailable={categories.isError}
          />

          <Button
            label="Create draft"
            fullWidth
            onPress={handleCreate}
            loading={create.isPending}
            accessibilityHint="Saves this event as a draft that only you can see"
          />

          {submitted && hasEventDraftErrors(errors) ? (
            <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
              Some fields need attention before this can be saved.
            </Text>
          ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
});
