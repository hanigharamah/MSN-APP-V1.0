import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { SectionCard } from '@/components/events';
import { deliveryModeLabel } from '@/components/providers';
import { FormError } from '@/components/auth/FormError';
import { Button, Input, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { AppError } from '@/lib/errors';
import { pickAndUploadImage } from '@/lib/queries/uploads';
import { spacing } from '@/theme';
import type { Category, DeliveryMode } from '@/types/database';

import { ChoiceField, type ChoiceOption } from './ChoiceField';
import { PickerField } from './PickerField';
import { DateTimeField } from './DateTimeField';
import { NoticeCard } from './NoticeCard';
import { ToggleField } from './ToggleField';
import { TimeZoneField } from './TimeZoneField';
import {
  DELIVERY_MODES,
  eventDraftNotes,
  needsMeetingUrl,
  paymentRailNoticeFor,
  type EventDraft,
  type EventDraftErrors,
} from './event-form';

export interface EventFormFieldsProps {
  draft: EventDraft;
  onChange: (draft: EventDraft) => void;
  errors: EventDraftErrors;
  /** Errors stay hidden until the first save attempt, as on the auth forms. */
  showErrors: boolean;
  categories: readonly Category[];
  categoriesUnavailable?: boolean;
}

const DELIVERY_OPTIONS: readonly ChoiceOption<DeliveryMode>[] = DELIVERY_MODES.map((mode) => ({
  value: mode,
  label: deliveryModeLabel(mode),
}));

/**
 * Every editable column on an event, in the order a host thinks about them.
 *
 * Shared by create and edit, because the only difference between the two is
 * which mutation the screen fires — a second copy of this form would drift
 * within a week.
 *
 * Two things are deliberately absent:
 *
 *  - **Status and `published_at`.** Publishing writes both in one statement
 *    (`events_published_has_timestamp`), so it is an action on the edit
 *    screen, not a field here.
 *  - **`event_occurrences`.** Editing individual dates is its own screen. The
 *    capacity hint says what the per-date `capacity` column does and does not
 *    do, so nobody infers a limit that checkout does not enforce.
 */
export function EventFormFields({
  draft,
  onChange,
  errors,
  showErrors,
  categories,
  categoriesUnavailable = false,
}: EventFormFieldsProps) {
  const { session } = useAuth();
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    onChange({ ...draft, [key]: value });
  };

  // Uploaded immediately rather than on save, for the same reason as the
  // avatar: the picture is the slow, failable half, and a save that writes
  // eleven fields should not also be the thing that can fail on a photograph.
  const uploadCover = useMutation({
    mutationFn: async () => {
      if (!session) throw new AppError('auth', 'Sign in again to add a photo.');
      return pickAndUploadImage({
        bucket: 'event-images',
        profileId: session.user.id,
        aspect: [16, 9],
      });
    },
    onSuccess: (url) => {
      if (url !== null) set('cover_url', url);
    },
  });

  const errorFor = (field: keyof EventDraftErrors): string | undefined =>
    showErrors ? (errors[field] ?? undefined) : undefined;

  const notes = eventDraftNotes(draft);
  const railNotice = paymentRailNoticeFor(draft.delivery_mode);
  const online = needsMeetingUrl(draft.delivery_mode);

  const categoryOptions: ChoiceOption<string>[] = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  return (
    <View style={styles.stack}>
      <SectionCard title="The basics">
        <View style={styles.fields}>
          <Input
            label="Title"
            required
            value={draft.title}
            onChangeText={(value) => set('title', value)}
            error={errorFor('title')}
            placeholder="Full Moon Sound Bath"
            autoCapitalize="sentences"
          />

          <Input
            label="Summary"
            value={draft.summary}
            onChangeText={(value) => set('summary', value)}
            error={errorFor('summary')}
            hint="One line. This is what people read on the listing card."
            maxLength={320}
          />

          <Input
            label="Description"
            value={draft.description}
            onChangeText={(value) => set('description', value)}
            multiline
            numberOfLines={6}
            hint="What happens, what to bring, who it is for."
          />

          {/* Pick a photo, or paste a link.
              The URL box is kept rather than replaced: a host who already has
              their poster hosted somewhere should not have to download it to
              their phone first just to upload it again. The picker is the
              primary route because typing a URL on a phone is miserable. */}
          <View style={styles.coverBlock}>
            {draft.cover_url ? (
              <Image
                source={{ uri: draft.cover_url }}
                style={styles.coverPreview}
                contentFit="cover"
                transition={150}
                accessibilityLabel="Cover image preview"
              />
            ) : null}

            <View style={styles.coverActions}>
              <Button
                label={draft.cover_url ? 'Choose another photo' : 'Choose a photo'}
                variant="secondary"
                size="sm"
                loading={uploadCover.isPending}
                onPress={() => uploadCover.mutate()}
              />
              {draft.cover_url ? (
                <Button
                  label="Remove"
                  variant="ghost"
                  size="sm"
                  disabled={uploadCover.isPending}
                  onPress={() => set('cover_url', '')}
                />
              ) : null}
            </View>

            {uploadCover.isError ? <FormError error={uploadCover.error} /> : null}

            <Input
              label="Or paste an image link"
              value={draft.cover_url}
              onChangeText={(value) => set('cover_url', value)}
              error={errorFor('cover_url')}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              hint="A full https:// link to a landscape image."
            />
          </View>

          {categoriesUnavailable ? (
            <Text variant="caption" color="muted">
              Categories could not be loaded, so the current one is left as it is.
            </Text>
          ) : (
            <PickerField
              label="Category"
              value={draft.category_id}
              options={categoryOptions}
              onChange={(value) => set('category_id', value)}
              onClear={() => set('category_id', null)}
              clearLabel="None"
              hint="How people filter the discovery feed."
            />
          )}
        </View>
      </SectionCard>

      <SectionCard title="Where and how">
        <View style={styles.fields}>
          <ChoiceField
            label="Delivery"
            required
            value={draft.delivery_mode}
            options={DELIVERY_OPTIONS}
            onChange={(value) => set('delivery_mode', value)}
          />

          {railNotice ? (
            <NoticeCard
              tone="warning"
              title="This choice decides how tickets are paid for"
              body={railNotice}
              source="App Store guidelines 3.1.3(d) and 3.1.3(e)"
            />
          ) : null}

          {online ? (
            <>
              <Input
                label="Joining link"
                value={draft.meeting_url}
                onChangeText={(value) => set('meeting_url', value)}
                error={errorFor('meeting_url')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="https://"
                hint="Required before this event can be published. Drafts may leave it blank."
              />
              <ToggleField
                label="Hide the link until someone has a ticket"
                value={draft.hide_meeting_url}
                onChange={(value) => set('hide_meeting_url', value)}
                description="On by default. Turning it off puts the joining link on the public event page."
              />
            </>
          ) : (
            <>
              <Input
                label="Venue name"
                value={draft.venue_name}
                onChangeText={(value) => set('venue_name', value)}
                autoCapitalize="words"
              />
              <Input
                label="Address"
                value={draft.address_line1}
                onChangeText={(value) => set('address_line1', value)}
                autoCapitalize="words"
              />
              <Input
                label="Address line 2"
                value={draft.address_line2}
                onChangeText={(value) => set('address_line2', value)}
                autoCapitalize="words"
              />
              <Input
                label="City"
                value={draft.city}
                onChangeText={(value) => set('city', value)}
                autoCapitalize="words"
              />
              <Input
                label="Region"
                value={draft.region}
                onChangeText={(value) => set('region', value)}
                autoCapitalize="words"
              />
              <View style={styles.row}>
                <Input
                  label="Country"
                  containerStyle={styles.half}
                  value={draft.country_code}
                  onChangeText={(value) => set('country_code', value)}
                  error={errorFor('country_code')}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={2}
                  placeholder="GB"
                />
                <Input
                  label="Postcode"
                  containerStyle={styles.half}
                  value={draft.postal_code}
                  onChangeText={(value) => set('postal_code', value)}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
              <ToggleField
                label="Hide the exact address"
                value={draft.hide_exact_address}
                onChange={(value) => set('hide_exact_address', value)}
                description="Shows the area publicly and the full address to ticket holders."
              />
            </>
          )}
        </View>
      </SectionCard>

      <SectionCard title="When">
        <View style={styles.fields}>
          <TimeZoneField
            value={draft.timezone}
            onChange={(value) => set('timezone', value)}
            error={errorFor('timezone')}
          />

          <DateTimeField
            label="Starts"
            required
            value={draft.starts}
            timeZone={draft.timezone}
            onChange={(value) => set('starts', value)}
            dateError={errorFor('starts_date')}
            timeError={errorFor('starts_time')}
            note={notes.starts}
          />

          <DateTimeField
            label="Ends"
            required
            value={draft.ends}
            timeZone={draft.timezone}
            onChange={(value) => set('ends', value)}
            dateError={errorFor('ends_date')}
            timeError={errorFor('ends_time')}
            note={notes.ends}
          />
        </View>
      </SectionCard>

      <SectionCard title="Tickets and access">
        <View style={styles.fields}>
          <ToggleField
            label="Free event"
            value={draft.is_free}
            onChange={(value) => set('is_free', value)}
            description="Marks the listing as free. Tiers still carry their own prices — set them to 0 as well."
          />

          <Input
            label="Currency"
            required
            value={draft.currency}
            onChangeText={(value) => set('currency', value)}
            error={errorFor('currency')}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={3}
            hint="The default for new ticket tiers. Each tier stores its own, and mixing them makes an event unbuyable."
          />

          <Input
            label="Capacity"
            value={draft.capacity}
            onChangeText={(value) => set('capacity', value)}
            error={errorFor('capacity')}
            keyboardType="number-pad"
            hint="Blank for no limit. This is a note on the listing — what checkout actually enforces is the quantity on each ticket tier."
          />

          <Input
            label="Minimum age"
            value={draft.min_age}
            onChangeText={(value) => set('min_age', value)}
            error={errorFor('min_age')}
            keyboardType="number-pad"
            hint="Blank if the event is open to everyone."
          />
        </View>
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  coverBlock: { gap: spacing.sm },
  coverPreview: { width: '100%', aspectRatio: 16 / 9, borderRadius: 8 },
  coverActions: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  stack: {
    gap: spacing.md,
  },
  fields: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  half: {
    flex: 1,
  },
});
