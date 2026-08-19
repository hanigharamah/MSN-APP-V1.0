import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, Modal, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { formatEventTime } from '@/lib/format';
import { qk } from '@/lib/queries/keys';
import {
  listPendingPhotoConsent,
  setPhotoConsent,
  type PendingPhotoConsent,
} from '@/lib/queries/photo-consent';
import { radii, spacing, useTheme } from '@/theme';

/**
 * The photo-consent card.
 *
 * ## Why it is asked here and not in the room
 *
 * A practitioner asking "does anyone mind if I take photos?" to fifteen people
 * lying on mats gets consent from nobody — it gets silence, which is not
 * consent, and it puts the one person who does mind in the position of
 * objecting out loud in front of strangers. Asking privately, right after
 * booking, is both the lawful version and the kinder one.
 *
 * ## Why it cannot be swiped away
 *
 * Mounted at the root and re-raised on every launch until it has an answer,
 * because an unanswered question defaults to "no photographs of this person",
 * which is a worse outcome for the practitioner than either real answer. That
 * is defensible only because **declining is exactly as easy as accepting** —
 * two buttons, one tap each, no hidden "no". A card that could only be
 * dismissed by agreeing would not be freely given consent, and would be worth
 * less than no consent at all.
 *
 * The answer is never final: it is editable from the booking afterwards, which
 * is the withdrawal route the regulation requires.
 */
export function PhotoConsentGate() {
  const { session, isAuthenticated } = useAuth();
  const viewerId = session?.user.id ?? '';
  const queryClient = useQueryClient();

  const pending = useQuery({
    queryKey: qk.tickets.pendingConsent(viewerId),
    queryFn: () => listPendingPhotoConsent(viewerId),
    enabled: isAuthenticated && viewerId !== '',
    // The answer is not urgent, but it must not be stale: someone who answered
    // on another device should not be asked again here.
    staleTime: 30_000,
  });

  // "If they leave the app immediately after booking, it comes back when they
  // reopen it." `refetchOnWindowFocus` is off globally for this app, so the
  // foreground event is wired here rather than turned on for every query.
  useEffect(() => {
    if (!isAuthenticated || viewerId === '') return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void queryClient.invalidateQueries({ queryKey: qk.tickets.pendingConsent(viewerId) });
    });

    return () => subscription.remove();
  }, [isAuthenticated, viewerId, queryClient]);

  const answer = useMutation({
    mutationFn: ({ eventId, consent }: { eventId: string; consent: boolean }) =>
      setPhotoConsent(eventId, consent),
    onSuccess: () => {
      // Drops the answered ticket out of the list, which advances the card to
      // the next one or closes it.
      void queryClient.invalidateQueries({ queryKey: qk.tickets.pendingConsent(viewerId) });
      void queryClient.invalidateQueries({ queryKey: qk.tickets.all });
    },
  });

  const queue = pending.data ?? [];
  const current = queue[0] ?? null;

  // A failed query asks nobody anything. Silence is the safe default here: the
  // consent stays unanswered, and unanswered already means "no photographs".
  if (!current) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <ConsentCard
        item={current}
        remaining={queue.length}
        busy={answer.isPending}
        failed={answer.isError}
        onAnswer={(consent) => answer.mutate({ eventId: current.event.id, consent })}
      />
    </Modal>
  );
}

function ConsentCard({
  item,
  remaining,
  busy,
  failed,
  onAnswer,
}: {
  item: PendingPhotoConsent;
  remaining: number;
  busy: boolean;
  failed: boolean;
  onAnswer: (consent: boolean) => void;
}) {
  const theme = useTheme();
  const host = item.event.host?.display_name ?? 'Your host';

  return (
    // No scrim Pressable: tapping outside is not an answer, and dismissing the
    // question is not one of the two options.
    <View style={[styles.scrim, { backgroundColor: theme.colors.overlay }]}>
      <View style={[styles.card, { backgroundColor: theme.colors.surfaceElevated }]}>
        <Text variant="h4">Photos at this session</Text>

        <Text variant="bodySmall" color="muted" style={styles.event}>
          {item.event.title} · {formatEventTime(item.event.starts_at, item.event.timezone)}
        </Text>

        <Text variant="body" color="secondary" style={styles.body}>
          {host} may take photographs during this session, and you might appear in
          them. They may use those photographs on their MSN page and to promote
          future sessions.
        </Text>

        <Text variant="bodySmall" color="muted" style={styles.body}>
          Saying no changes nothing about your booking, and you can change your
          answer at any time from your ticket.
        </Text>

        {failed ? (
          <Text variant="bodySmall" color="danger" style={styles.body}>
            That did not save. Please try again.
          </Text>
        ) : null}

        {/* Two taps, one each. Neither answer is hidden behind the other, and
            neither is a smaller target — the point at which a consent flow
            stops being lawful is the point at which "no" becomes harder. */}
        <View style={styles.actions}>
          <Button
            label="Yes, that's fine"
            fullWidth
            loading={busy}
            onPress={() => onAnswer(true)}
            accessibilityHint="Agrees to appear in photographs from this session"
          />
          <Button
            label="No, please don't"
            variant="secondary"
            fullWidth
            disabled={busy}
            onPress={() => onAnswer(false)}
            accessibilityHint="Declines to appear in photographs from this session"
          />
        </View>

        {remaining > 1 ? (
          <Text variant="caption" color="muted" style={styles.remaining}>
            {remaining - 1} more to answer
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', padding: spacing.md },
  card: { borderRadius: radii.xl, padding: spacing.md, gap: spacing.xs },
  event: { marginBottom: spacing.xs },
  body: { marginTop: spacing.xxs },
  actions: { marginTop: spacing.md, gap: spacing.sm },
  remaining: { marginTop: spacing.sm, textAlign: 'center' },
});
