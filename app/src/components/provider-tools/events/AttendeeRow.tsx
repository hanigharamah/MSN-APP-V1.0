import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Badge, Button, Card, Text } from '@/components/ui';
import { formatLocal } from '@/lib/format';
import { spacing, useTheme } from '@/theme';
import type { Ticket } from '@/types/database';

export interface AttendeeRowProps {
  ticket: Ticket;
  onCheckIn: () => void;
  checkingIn: boolean;
  /** Blocks every row's button while one check-in is in flight. */
  disabled?: boolean;
}

/**
 * One attendee, from the door.
 *
 * `checked_in_at` is a platform timestamp, not an offering time, so it renders
 * in the VIEWER's zone — the person holding the phone is the one who wants to
 * know when they scanned it. That is the opposite of every other time on these
 * screens, and it is the right way round: the event's start time belongs to
 * the event, the scan belongs to whoever did the scanning.
 *
 * A void ticket is shown rather than hidden. A refunded attendee turning up at
 * the door is exactly the case a host needs to see, and silently dropping the
 * row would leave them arguing with someone who has a ticket in their hand.
 */
export function AttendeeRow({ ticket, onCheckIn, checkingIn, disabled = false }: AttendeeRowProps) {
  const name = ticket.attendee_name?.trim();
  const email = ticket.attendee_email?.trim();
  const title = name && name.length > 0 ? name : `Ticket ${ticket.code}`;

  const checkedIn = ticket.checked_in_at !== null;

  return (
    <Card variant="outlined" padding="sm">
      <View style={styles.header}>
        <View style={styles.text}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {title}
          </Text>
          {email && email.length > 0 ? (
            <Text variant="caption" color="muted" numberOfLines={1}>
              {email}
            </Text>
          ) : null}
          <Text variant="caption" color="muted" numberOfLines={1}>
            {ticket.code}
          </Text>
        </View>

        <PhotoConsent consent={ticket.photo_consent} />

        {ticket.is_void ? (
          <Badge label="Void" tone="danger" />
        ) : checkedIn ? (
          <Badge label="Checked in" tone="success" />
        ) : (
          <Badge label="Not arrived" tone="neutral" />
        )}
      </View>

      {checkedIn && ticket.checked_in_at !== null ? (
        <Text variant="caption" color="muted">
          Checked in {formatLocal(ticket.checked_in_at)}
        </Text>
      ) : null}

      {!checkedIn && !ticket.is_void ? (
        <Button
          label="Check in"
          variant="secondary"
          size="sm"
          onPress={onCheckIn}
          loading={checkingIn}
          disabled={disabled && !checkingIn}
          accessibilityLabel={`Check in ${title}`}
          accessibilityHint="Marks this attendee as arrived"
          style={styles.action}
        />
      ) : null}
    </Card>
  );
}

/**
 * Photo consent, on the list rather than the faces card.
 *
 * The same three states as the welcome card's dot, but this list has room for
 * words, so it uses them. That also settles the one weakness of the coloured
 * dot: red and amber are the pair that colour blindness most often collapses,
 * and "No photos" versus "Not answered" cannot be misread.
 *
 * Amber is deliberately not silence. An attendee nobody has asked yet is a
 * different thing from one who said no, and a host who treats the two the same
 * is the failure this feature exists to prevent.
 */
function PhotoConsent({ consent }: { consent: boolean | null }) {
  const theme = useTheme();

  const { color, label } =
    consent === true
      ? { color: theme.colors.success, label: 'Happy to be photographed' }
      : consent === false
        ? { color: theme.colors.danger, label: 'Asked not to be photographed' }
        : { color: theme.colors.warning, label: 'Has not answered about photographs' };

  return (
    <View
      style={[styles.consent, { backgroundColor: theme.colors.surfaceSunken }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      {/* Same three shapes as the welcome card's dot — solid, hollow, struck
          through — so the answer survives a reading with no colour at all. */}
      <Ionicons name={consent === true ? 'camera' : 'camera-outline'} size={17} color={color} />
      {consent === false ? <View style={[styles.slash, { backgroundColor: color }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // A tinted disc rather than a bare glyph: amber on the card's own background
  // is the weakest of the three, and a consistent well behind all of them keeps
  // the contrast the same whichever answer it is showing.
  slash: {
    position: 'absolute',
    width: 22,
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
  },
  consent: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
  action: {
    marginTop: spacing.xs,
  },
});
