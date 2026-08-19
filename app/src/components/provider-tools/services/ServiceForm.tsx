import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormError } from '@/components/auth/FormError';
import { Button, Input, Text } from '@/components/ui';
import { AppError } from '@/lib/errors';
import { formatCancellationWindow, formatDuration, formatMoney } from '@/lib/format';
import { radii, spacing, useTheme } from '@/theme';
import { DeliveryModeField } from './DeliveryModeField';
import { NoticeCard } from './NoticeCard';
import { SwitchRow } from './SwitchRow';
import {
  DESCRIPTION_MAX_LENGTH,
  firstError,
  parsePriceToCents,
  parseWholeNumber,
  validateDraft,
  valuesFromDraft,
  type ServiceDraft,
  type ServiceValues,
} from './service-form';

export interface ServiceFormProps {
  /**
   * Where the draft starts. Read once, at mount — the form owns the draft from
   * then on. Screens mount this only when their data has arrived, and key it by
   * service id, so a refetch cannot overwrite what someone is typing.
   */
  initial: ServiceDraft;
  submitLabel: string;
  submitting: boolean;
  /** The failed save, if there was one. Rendered as a banner above the button. */
  error: unknown;
  onSubmit: (values: ServiceValues) => void;
  /** Called on any edit, so the screen can clear a failed save. */
  onEdit?: () => void;
}

/**
 * Create or edit a service.
 *
 * Two rules the form exists to communicate, both of which bite somewhere else:
 *
 * 1. **`delivery_mode` decides the payment rail.** See `DeliveryModeField` —
 *    the consequence is printed under the choice, not in help text.
 * 2. **`cancellation_window_hours` is snapshotted onto every booking when it is
 *    made.** Editing it here changes what new bookings are sold; the ones
 *    already taken keep the terms they were shown. Refund policy §2.3 —
 *    undisclosed terms are not binding, which cuts both ways.
 *
 * Money is typed in major units and converted to integer cents by
 * `service-form.ts`, which is the only place the two representations meet.
 */
export function ServiceForm({
  initial,
  submitLabel,
  submitting,
  error,
  onSubmit,
  onEdit,
}: ServiceFormProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState<ServiceDraft>(initial);
  const [submitted, setSubmitted] = useState(false);

  const errors = validateDraft(draft);
  const blockingError = firstError(errors);
  // Errors appear after the first attempt, not while a field is still being
  // typed into for the first time. Same contract as the auth screens.
  const shown = (field: keyof ServiceDraft): string | undefined =>
    submitted ? (errors[field] ?? undefined) : undefined;

  function set<K extends keyof ServiceDraft>(field: K, value: ServiceDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
    onEdit?.();
  }

  const digitsOnly = (value: string) => value.replace(/[^0-9]/g, '');

  function handleSubmit() {
    setSubmitted(true);
    const values = valuesFromDraft(draft);
    if (values === null) return;
    onSubmit(values);
  }

  // --- Live previews ---------------------------------------------------------
  // Formatted only at render, from the parsed integers — never from the typed
  // string (CONVENTIONS §8).
  const priceCents = parsePriceToCents(draft.price);
  const currencyCode = draft.currency.trim().toUpperCase();
  const pricePreview =
    priceCents === null || !/^[A-Z]{3}$/.test(currencyCode)
      ? undefined
      : priceCents === 0
        ? 'Free. Anyone can book without paying.'
        : formatMoney(priceCents, currencyCode);

  const durationMinutes = parseWholeNumber(draft.duration_minutes);
  const durationPreview =
    durationMinutes === null || durationMinutes === 0
      ? undefined
      : `Each booking runs ${formatDuration(durationMinutes)}.`;

  const bufferMinutes = parseWholeNumber(draft.buffer_minutes);
  const bufferPreview =
    bufferMinutes === null
      ? undefined
      : bufferMinutes === 0
        ? 'No gap. Bookings can sit back to back.'
        : `${formatDuration(bufferMinutes)} kept free either side of every booking.`;

  const cancellationHours = parseWholeNumber(draft.cancellation_window_hours);
  const cancellationPreview =
    cancellationHours === null
      ? undefined
      : // `formatCancellationWindow(0)` reads "No free cancellation", which is
        // the honest reading of 0 — it does NOT mean "cancel any time".
        `Seekers see: “${formatCancellationWindow(cancellationHours)}”`;

  const coverUrl = draft.cover_url.trim();
  const showCoverPreview = errors.cover_url === null && coverUrl.length > 0;

  return (
    <View style={styles.form}>
      {/* --- The basics ------------------------------------------------- */}
      <Text variant="h4" heading={2}>
        The basics
      </Text>

      <Input
        label="Name"
        required
        value={draft.title}
        onChangeText={(value) => set('title', value)}
        error={shown('title')}
        hint="What a seeker sees first. “Sound Bath”, “60-minute deep tissue”."
        autoCapitalize="sentences"
        maxLength={120}
      />

      <Input
        label="Description"
        value={draft.description}
        onChangeText={(value) => set('description', value)}
        error={shown('description')}
        hint="What happens in the session, who it suits, what to bring."
        multiline
        numberOfLines={5}
        maxLength={DESCRIPTION_MAX_LENGTH}
      />

      <View>
        <Input
          label="Cover image URL"
          value={draft.cover_url}
          onChangeText={(value) => set('cover_url', value)}
          error={shown('cover_url')}
          hint="Optional. A link to an image already on the web."
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {showCoverPreview ? (
          <View style={[styles.coverPreview, { backgroundColor: theme.colors.surfaceMuted }]}>
            {/* Behind the image: a URL that 404s leaves this showing rather
                than a broken frame, which is also what a seeker would see. */}
            <Ionicons name="leaf-outline" size={24} color={theme.colors.textMuted} />
            <Image
              source={{ uri: coverUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
              accessibilityIgnoresInvertColors
              accessibilityLabel="Preview of the cover image"
            />
          </View>
        ) : null}
      </View>

      {/* --- Delivery ---------------------------------------------------- */}
      <Text variant="h4" heading={2} style={styles.sectionTop}>
        Delivery
      </Text>

      <DeliveryModeField
        value={draft.delivery_mode}
        onChange={(mode) => set('delivery_mode', mode)}
        disabled={submitting}
      />

      {/* --- Time -------------------------------------------------------- */}
      <Text variant="h4" heading={2} style={styles.sectionTop}>
        Time
      </Text>

      <Input
        label="Length, in minutes"
        required
        value={draft.duration_minutes}
        onChangeText={(value) => set('duration_minutes', digitsOnly(value))}
        error={shown('duration_minutes')}
        hint={durationPreview ?? 'How long one session runs.'}
        keyboardType="number-pad"
        maxLength={5}
      />

      <Input
        label="Gap between bookings, in minutes"
        value={draft.buffer_minutes}
        onChangeText={(value) => set('buffer_minutes', digitsOnly(value))}
        error={shown('buffer_minutes')}
        hint={bufferPreview ?? 'Travel, notes, a breath. Blank means none.'}
        keyboardType="number-pad"
        maxLength={5}
      />

      {/* --- Price ------------------------------------------------------- */}
      <Text variant="h4" heading={2} style={styles.sectionTop}>
        Price
      </Text>

      <View style={styles.priceRow}>
        <Input
          label="Price"
          required
          value={draft.price}
          onChangeText={(value) => set('price', value.replace(/[^0-9.,]/g, ''))}
          error={shown('price')}
          hint={pricePreview}
          keyboardType="decimal-pad"
          placeholder="45.00"
          containerStyle={styles.priceField}
        />
        <Input
          label="Currency"
          required
          value={draft.currency}
          onChangeText={(value) =>
            set('currency', value.replace(/[^A-Za-z]/g, '').toUpperCase())
          }
          error={shown('currency')}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={3}
          containerStyle={styles.currencyField}
        />
      </View>

      {/* --- Booking terms ----------------------------------------------- */}
      <Text variant="h4" heading={2} style={styles.sectionTop}>
        Booking terms
      </Text>

      <Input
        label="Free cancellation window, in hours"
        required
        value={draft.cancellation_window_hours}
        onChangeText={(value) => set('cancellation_window_hours', digitsOnly(value))}
        error={shown('cancellation_window_hours')}
        hint={cancellationPreview ?? 'Hours before the start that a seeker can still cancel.'}
        keyboardType="number-pad"
        maxLength={5}
      />

      <NoticeCard
        icon="lock-closed-outline"
        title="Locked onto each booking when it is made"
        body="Every booking keeps a copy of this window from the moment it is taken. Changing it here only affects bookings made afterwards — the ones you already have keep the terms they were sold under, and no edit can shorten them."
      />

      {cancellationHours === 0 ? (
        <NoticeCard
          tone="warning"
          icon="alert-circle-outline"
          title="Zero means no free cancellation"
          body="It does not mean people can cancel whenever they like. At zero, a seeker who cancels is not entitled to their money back — which is a strong term, and they are shown it before they pay."
        />
      ) : null}

      <SwitchRow
        label="Approve each booking"
        description="Requests wait for your yes instead of confirming on the spot."
        value={draft.requires_approval}
        onValueChange={(next) => set('requires_approval', next)}
        disabled={submitting}
        accessibilityHint="When on, a seeker's chosen time is held as a request until you accept it."
      />

      {/* --- Submit ------------------------------------------------------ */}
      {/*
        A failed submit is otherwise completely silent: the field that needs
        fixing can be several screens up, and for a screen-reader user nothing
        happens at all. `FormError` carries `accessibilityLiveRegion`, so the
        first problem is announced as well as shown, next to the button that
        appeared not to work.
      */}
      {submitted && blockingError !== null ? (
        <FormError
          error={new AppError('validation', `${blockingError} Check the fields above.`)}
        />
      ) : null}

      <FormError error={error} />

      <Button
        label={submitLabel}
        onPress={handleSubmit}
        loading={submitting}
        fullWidth
        style={styles.submit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  sectionTop: {
    marginTop: spacing.md,
  },
  coverPreview: {
    marginTop: spacing.xs,
    height: 120,
    borderRadius: radii.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priceField: {
    flex: 2,
  },
  currencyField: {
    flex: 1,
  },
  submit: {
    marginTop: spacing.xs,
  },
});
