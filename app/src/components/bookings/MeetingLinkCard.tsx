import { Alert, Linking, StyleSheet } from 'react-native';

import { Button, Card, Text } from '@/components/ui';
import type { BookingWithParties } from '@/lib/queries/bookings';
import { spacing } from '@/theme';
import { hasEnded, isTerminalBooking } from './cancellation';

export interface MeetingLinkCardProps {
  booking: BookingWithParties;
  viewerRole: 'seeker' | 'provider';
}

/**
 * The join link for an online session.
 *
 * Rendered only for `online_live` and `one_to_one` — an in-person session has
 * nowhere to click through to, and an empty "Join" card on a booking at a
 * studio is a support ticket waiting to happen.
 *
 * The link stays visible from confirmation onward rather than appearing at the
 * start time: people check that a link works the night before, and hiding it
 * until the last minute produces exactly the panic it is meant to prevent. It
 * disappears once the session has ended.
 */
export function MeetingLinkCard({ booking, viewerRole }: MeetingLinkCardProps) {
  const mode = booking.service?.delivery_mode;
  if (mode === undefined || mode === null || mode === 'in_person') return null;
  if (isTerminalBooking(booking.status) || hasEnded(booking)) return null;

  const url = booking.meeting_url;

  const open = () => {
    if (!url) return;
    void Linking.openURL(url).catch(() => {
      Alert.alert(
        'Could not open the link',
        'Copy it into your browser instead, or ask the other person to resend it.',
      );
    });
  };

  return (
    <Card variant="outlined" style={styles.card}>
      <Text variant="h4" heading={2}>
        Joining
      </Text>

      {url && booking.status === 'confirmed' ? (
        <>
          <Text variant="bodySmall" color="secondary" selectable numberOfLines={2}>
            {url}
          </Text>
          <Button
            label="Join session"
            onPress={open}
            fullWidth
            accessibilityLabel="Join session"
            accessibilityHint="Opens the meeting link in your browser"
          />
        </>
      ) : url ? (
        <Text variant="bodySmall" color="secondary">
          This session has a meeting link. It becomes tappable once the booking is confirmed.
        </Text>
      ) : (
        <Text variant="bodySmall" color="secondary">
          {viewerRole === 'seeker'
            ? 'No meeting link yet. The practitioner adds it before the session — you will see it here and in your messages.'
            : // TODO(agent · bookings): a provider needs to be able to set
              // `bookings.meeting_url` from here, but there is no
              // `updateBooking` in `lib/queries/bookings.ts` to call and this
              // agent does not own that file. Until it exists the provider has
              // to send the link by message.
              'No meeting link on this booking yet. Send it to the seeker in your conversation.'}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
  },
});
