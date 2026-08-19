import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormError } from '@/components/auth/FormError';
import { BottomSheet } from '@/components/events';
import { Button, Input, Text } from '@/components/ui';
import { qk } from '@/lib/queries/keys';
import { spacing } from '@/theme';
import type { TicketType } from '@/types/database';

import { DateTimeField } from './DateTimeField';
import { NoticeCard } from './NoticeCard';
import { ToggleField } from './ToggleField';
import { createTicketType, hostTicketTypesKey, updateTicketType } from './host-queries';
import {
  emptyTicketDraft,
  hasTicketDraftErrors,
  ticketDraftFrom,
  ticketDraftNotes,
  ticketDraftToInsert,
  ticketDraftToUpdate,
  validateTicketDraft,
  type TicketDraft,
} from './ticket-form';

export interface TicketTierSheetProps {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  /** The event's zone. Sale windows are wall-clock times in it. */
  timeZone: string;
  /** Seeds the currency on a new tier. */
  eventCurrency: string;
  /** The tier being edited, or null to create one. */
  ticket: TicketType | null;
  /**
   * The currency every other active tier already uses, or null when the choice
   * is still open. Mixing currencies makes the event unbuyable, so this is a
   * hard constraint on the field rather than advice.
   */
  lockedCurrency: string | null;
}

/**
 * Create or edit one ticket tier.
 *
 * Owns its own mutation, the way `CheckoutSheet` does: the states it can land
 * in are the sheet's UI and nothing outside it needs them. Both mutations
 * invalidate the host's tier list and the buyer's active-only list, because a
 * tier switched off here has to disappear from the public event screen.
 */
export function TicketTierSheet(props: TicketTierSheetProps) {
  return (
    <BottomSheet
      visible={props.visible}
      onClose={props.onClose}
      title={props.ticket ? 'Edit ticket tier' : 'New ticket tier'}
    >
      {/* Mounted only while open, so every open starts from the row as it is
          now rather than from a draft left over from last time. */}
      {props.visible ? <TicketTierForm {...props} /> : null}
    </BottomSheet>
  );
}

function TicketTierForm({
  onClose,
  eventId,
  timeZone,
  eventCurrency,
  ticket,
  lockedCurrency,
}: TicketTierSheetProps) {
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<TicketDraft>(() =>
    ticket
      ? ticketDraftFrom(ticket, timeZone)
      : emptyTicketDraft(lockedCurrency ?? eventCurrency),
  );
  const [submitted, setSubmitted] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      if (ticket) {
        return updateTicketType(ticket.id, ticketDraftToUpdate(draft, timeZone));
      }
      return createTicketType(ticketDraftToInsert(draft, eventId, timeZone));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: hostTicketTypesKey(eventId) }),
        queryClient.invalidateQueries({ queryKey: qk.events.ticketTypes(eventId) }),
      ]);
      onClose();
    },
  });

  const errors = validateTicketDraft(draft, {
    timeZone,
    lockedCurrency,
    quantitySold: ticket?.quantity_sold ?? 0,
  });
  const notes = ticketDraftNotes(draft);

  const set = <K extends keyof TicketDraft>(key: K, value: TicketDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    // Editing clears a failed save — leaving the banner up while someone
    // corrects the thing it complained about reads as a retry that failed.
    if (save.isError) save.reset();
  };

  const errorFor = (field: keyof typeof errors): string | undefined =>
    submitted ? (errors[field] ?? undefined) : undefined;

  function handleSave() {
    setSubmitted(true);
    if (hasTicketDraftErrors(errors)) return;
    save.mutate();
  }

  return (
    <View style={styles.stack}>
      {save.isError ? <FormError error={save.error} /> : null}

      <Input
        label="Name"
        required
        value={draft.name}
        onChangeText={(value) => set('name', value)}
        error={errorFor('name')}
        placeholder="Early bird"
        autoCapitalize="sentences"
      />

      <Input
        label="Description"
        value={draft.description}
        onChangeText={(value) => set('description', value)}
        multiline
        numberOfLines={3}
        hint="What this tier includes, if it differs from the others."
      />

      <View style={styles.row}>
        <Input
          label="Price"
          required
          containerStyle={styles.grow}
          value={draft.price}
          onChangeText={(value) => set('price', value)}
          error={errorFor('price')}
          keyboardType="decimal-pad"
          hint="0 for a free tier."
        />
        <Input
          label="Currency"
          required
          containerStyle={styles.currency}
          value={draft.currency}
          onChangeText={(value) => set('currency', value)}
          error={errorFor('currency')}
          editable={lockedCurrency === null}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={3}
        />
      </View>

      {lockedCurrency !== null ? (
        <Text variant="caption" color="muted">
          Locked to {lockedCurrency} by the other tiers on this event. One payment cannot span two
          currencies — checkout refuses the whole basket if they disagree.
        </Text>
      ) : null}

      <Input
        label="Quantity"
        value={draft.quantity}
        onChangeText={(value) => set('quantity', value)}
        error={errorFor('quantity')}
        keyboardType="number-pad"
        hint="Blank for unlimited. This is one pool for the whole event, shared by every date."
      />

      <Input
        label="Maximum per order"
        required
        value={draft.max_per_order}
        onChangeText={(value) => set('max_per_order', value)}
        error={errorFor('max_per_order')}
        keyboardType="number-pad"
      />

      <DateTimeField
        label="Sales open"
        optional
        value={draft.sales_start}
        timeZone={timeZone}
        onChange={(value) => set('sales_start', value)}
        error={submitted ? (errors.sales_start ?? undefined) : undefined}
        hint="Leave blank to sell from the moment the event goes live."
      />

      <DateTimeField
        label="Sales close"
        optional
        value={draft.sales_end}
        timeZone={timeZone}
        onChange={(value) => set('sales_end', value)}
        error={submitted ? (errors.sales_end ?? undefined) : undefined}
        hint="Leave blank to sell until the event starts."
      />

      <ToggleField
        label="Active"
        value={draft.is_active}
        onChange={(value) => set('is_active', value)}
        description="Inactive tiers stay on the event but cannot be bought."
      />

      {notes.map((note) => (
        <NoticeCard key={note} tone="warning" title="Worth knowing" body={note} />
      ))}

      {ticket && ticket.quantity_sold > 0 ? (
        <NoticeCard
          tone="info"
          title={`${ticket.quantity_sold} already sold`}
          body="Sold counts are maintained by checkout and cannot be edited here. The quantity cannot be reduced below what has gone."
          source="ticket_not_oversold"
        />
      ) : null}

      <View style={styles.actions}>
        <Button label="Cancel" variant="ghost" onPress={onClose} />
        <Button
          label={ticket ? 'Save tier' : 'Add tier'}
          onPress={handleSave}
          loading={save.isPending}
          style={styles.grow}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  grow: {
    flex: 1,
  },
  currency: {
    width: 108,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
