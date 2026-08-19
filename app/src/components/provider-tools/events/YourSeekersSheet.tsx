import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ErrorState, Skeleton, Text } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { formatEventTime } from '@/lib/format';
import { qk } from '@/lib/queries/keys';
import {
  attendeeLabel,
  listEventAttendees,
  setTicketArrived,
  type EventAttendee,
} from '@/lib/queries/orders';
import { radii, spacing } from '@/theme';

export interface YourSeekersSheetProps {
  eventId: string;
  visible: boolean;
  onClose: () => void;
}

/** How long before a session the card can be opened. */
export const WELCOME_OPENS_BEFORE_MS = 15 * 60_000;

/** Below this, the wait is a countdown; above it, a time. */
const COUNTDOWN_UNDER_MS = 60 * 60_000;

export interface WelcomeWindow {
  /** `early` and `over` both mean the control is shown but not pressable. */
  state: 'early' | 'open' | 'over';
  /** The button's label in that state. */
  label: string;
}

/**
 * Whether the welcome card can be opened, and what its button should say.
 *
 * A pure function of the two timestamps and the clock, so the same input always
 * gives the same answer — the caller owns "now" (see `useNow`) and this never
 * reads it.
 *
 * ## Why the control is shown when it cannot be used
 *
 * It used to render as nothing outside the window, on the reasoning that an
 * absent control asks no questions. In practice the opposite happened: the
 * feature was invisible almost all of the time, including to the person looking
 * for it, and there was no way to learn it existed before the fifteen minutes
 * that matter. A disabled button that names its own opening time teaches the
 * rule once and then gets out of the way.
 *
 * The window itself is unchanged. Marking somebody present at a session three
 * weeks out is still impossible, which is the part that protects the record.
 */
export function welcomeWindowFor(
  startsAtIso: string,
  endsAtIso: string,
  timeZone: string,
  now: number,
): WelcomeWindow {
  const opensAt = new Date(startsAtIso).getTime() - WELCOME_OPENS_BEFORE_MS;
  const endsAt = new Date(endsAtIso).getTime();

  if (now > endsAt) return { state: 'over', label: 'Your seekers · session over' };
  if (now >= opensAt) return { state: 'open', label: 'Your seekers' };

  const wait = opensAt - now;
  if (wait < COUNTDOWN_UNDER_MS) {
    // Rounded up, so it never reads "in 0 min" while still shut.
    const minutes = Math.max(1, Math.ceil(wait / 60_000));
    return { state: 'early', label: `Opens in ${minutes} min` };
  }

  // Far enough out that a countdown is useless — give the clock time instead,
  // in the session's own zone, with the date so it can never be read as today.
  return {
    state: 'early',
    label: `Opens ${formatEventTime(new Date(opensAt).toISOString(), timeZone)}`,
  };
}

/**
 * Your seekers — the welcome card.
 *
 * ## What this replaces
 *
 * Scanning. For a fifteen-person gong bath the practitioner already knows who
 * is coming and is already greeting them by name, so a QR code is a step added
 * to a conversation that was happening anyway. This is a card of faces: tap
 * someone as they walk in.
 *
 * ## Why faces, and why a ring
 *
 * The practitioner is looking at a room, not a spreadsheet. A lit ring around
 * the people who are here makes the answer to "can I start?" visible at a
 * glance and in peripheral vision — you see the shape of the room rather than
 * reading a count. The number is there as a caption, not as the answer.
 *
 * Nobody is ever marked absent. Whoever is still unlit at the end did not come,
 * which is the same information without asking anyone to make a judgement about
 * another person in the moment.
 *
 * ## Dark, on purpose
 *
 * Regardless of the app's theme. This is the one screen used in a candlelit
 * room, and a full-brightness white sheet in a sound bath is disruptive to
 * everybody in it — the practitioner would dim their phone and then be unable
 * to read it.
 *
 * ## Deliberately NOT a route
 *
 * A card over the session page they were already on. A pushed screen means a
 * back button, a navigation stack and somewhere to get lost, thirty seconds
 * before they need to start.
 */
export function YourSeekersSheet({ eventId, visible, onClose }: YourSeekersSheetProps) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      {/* Remounted per open so the list is always current — a card showing who
          was here twenty minutes ago is worse than no card. */}
      {visible ? <SeekersCard eventId={eventId} onClose={onClose} /> : null}
    </Modal>
  );
}

function SeekersCard({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const hostId = session?.user.id ?? '';

  const attendees = useQuery({
    queryKey: [...qk.events.detail(eventId), 'seekers'] as const,
    queryFn: () => listEventAttendees(eventId),
  });

  const toggle = useMutation({
    mutationFn: ({ ticketId, arrived }: { ticketId: string; arrived: boolean }) =>
      setTicketArrived(ticketId, hostId, arrived),
    // Optimistic: the ring has to light under the thumb. A round trip before
    // the ring appears makes the practitioner tap twice, which un-marks them.
    onMutate: async ({ ticketId, arrived }) => {
      const key = [...qk.events.detail(eventId), 'seekers'] as const;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<EventAttendee[]>(key);
      queryClient.setQueryData<EventAttendee[]>(key, (current) =>
        (current ?? []).map((row) =>
          row.id === ticketId
            ? { ...row, checked_in_at: arrived ? new Date().toISOString() : null }
            : row,
        ),
      );
      return { previous, key };
    },
    onError: (_error, _vars, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.events.detail(eventId) });
    },
  });

  const rows = attendees.data ?? [];
  const here = rows.filter((row) => row.checked_in_at !== null).length;
  // Surfaced as a sentence as well as icons: the number a practitioner needs
  // before they raise a camera is "how many said no", and counting red dots
  // across a grid of forty faces is not a reliable way to get it.
  const noPhotos = rows.filter((row) => row.photo_consent === false).length;

  return (
    <View style={styles.scrim}>
      {/* Tapping the dimmed area closes, the way every iOS sheet does. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />

      <View style={styles.card}>
        {/* Says "this is dismissable" before anyone hunts for a control. */}
        <View style={styles.grabber} />

        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="h4" style={styles.title}>
              Your seekers
            </Text>
            <Text variant="bodySmall" style={styles.subtitle}>
              {attendees.isPending
                ? 'Loading'
                : rows.length === 0
                  ? 'Nobody booked yet'
                  : `${here} of ${rows.length} here · tap as they arrive`}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <View style={styles.closeButton}>
              <Text variant="body" style={styles.close}>
                ✕
              </Text>
            </View>
          </Pressable>
        </View>

        {noPhotos > 0 ? (
          <View style={styles.photoNotice}>
            <Ionicons name="camera" size={13} color={CONSENT_NO} />
            <Text variant="caption" style={styles.photoNoticeText}>
              {noPhotos === 1
                ? '1 person asked not to be photographed'
                : `${noPhotos} people asked not to be photographed`}
            </Text>
          </View>
        ) : null}

        {attendees.isPending ? (
          <View style={styles.loading}>
            <Skeleton height={64} radius="lg" />
            <Skeleton height={64} radius="lg" />
          </View>
        ) : attendees.isError ? (
          <ErrorState error={attendees.error} onRetry={() => void attendees.refetch()} />
        ) : rows.length === 0 ? (
          <Text variant="bodySmall" style={styles.empty}>
            Faces appear here as soon as someone books.
          </Text>
        ) : (
          <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
            {rows.map((row) => (
              <SeekerFace
                key={row.id}
                attendee={row}
                onPress={() =>
                  toggle.mutate({ ticketId: row.id, arrived: row.checked_in_at === null })
                }
              />
            ))}
          </ScrollView>
        )}

        <Pressable
          onPress={onClose}
          style={styles.done}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text variant="bodyStrong" style={styles.doneText}>
            Done
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SeekerFace({
  attendee,
  onPress,
}: {
  attendee: EventAttendee;
  onPress: () => void;
}) {
  const arrived = attendee.checked_in_at !== null;
  const name = attendeeLabel(attendee);

  return (
    <Pressable
      onPress={onPress}
      style={styles.face}
      accessibilityRole="button"
      // Screen readers get the state in words — a glow is not announced.
      accessibilityLabel={`${name}, ${arrived ? 'here. Tap to undo.' : 'not here yet'} ${consentLabel(attendee.photo_consent)}`}
      accessibilityState={{ selected: arrived }}
    >
      <View style={styles.photoWrap}>
        <View style={arrived ? styles.ringLit : undefined}>
        {attendee.holder?.avatar_url ? (
          <Image
            source={{ uri: attendee.holder.avatar_url }}
            style={[styles.photo, arrived ? styles.photoLit : styles.photoWaiting]}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={120}
            accessible={false}
          />
        ) : (
          // No photograph. Initials at the same size rather than a blank disc,
          // so a room of people without pictures still reads as people.
          <View
            style={[
              styles.photo,
              styles.initials,
              arrived ? styles.photoLit : styles.photoWaiting,
            ]}
          >
            <Text variant="bodyStrong" style={styles.initialsText}>
              {name.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        </View>

        <ConsentBadge consent={attendee.photo_consent} />
      </View>

      <Text
        variant="caption"
        numberOfLines={1}
        style={arrived ? styles.nameLit : styles.nameWaiting}
      >
        {name}
      </Text>
    </Pressable>
  );
}

/**
 * Photo consent, as a dot on the face.
 *
 * Three states and three colours, because the third one is the whole point:
 * amber is "we have not been told", which is operationally different from a
 * refusal. A practitioner who reads amber as permission is the failure this
 * exists to prevent, so the wording everywhere says "not answered", never
 * "pending" — pending implies a yes is on its way.
 *
 * Colour alone is not the signal. The face's accessibility label spells the
 * state out in words, since a red/green pair is the exact distinction the
 * commonest form of colour blindness loses.
 */
function ConsentBadge({ consent }: { consent: boolean | null }) {
  const color = consent === true ? CONSENT_YES : consent === false ? CONSENT_NO : CONSENT_UNKNOWN;

  return (
    <View style={[styles.badge, { borderColor: CARD, backgroundColor: CARD }]}>
      {/* Solid camera for yes, hollow for not-yet-answered, struck through for
          no. The SHAPE carries the answer and the colour reinforces it — red
          and amber measure 1.66:1 against each other, which is exactly the pair
          the commonest colour blindness collapses, so colour alone would have
          left a refusal and an unanswered question looking identical (1.4.1). */}
      <Ionicons
        name={consent === true ? 'camera' : 'camera-outline'}
        size={11}
        color={color}
      />
      {consent === false ? <View style={[styles.badgeSlash, { backgroundColor: color }]} /> : null}
    </View>
  );
}

function consentLabel(consent: boolean | null): string {
  if (consent === true) return 'Happy to be photographed.';
  if (consent === false) return 'Asked not to be photographed.';
  return 'Has not answered about photographs.';
}

// Fixed colours, not theme tokens: this card is dark in both app themes, so a
// token that flips with the theme would make it unreadable in one of them.
const CARD = '#1F1926';
const TEXT = '#F6F1F5';
const MUTED = '#9B8FA2';
const FAINT = '#6B5F73';
// Traffic light, tuned for a dark surface rather than taken from the theme's
// success/danger — those are mixed for white backgrounds and go muddy here.
const CONSENT_YES = '#4ADE80';
const CONSENT_NO = '#F87171';
const CONSENT_UNKNOWN = '#FBBF24';

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(8,5,10,0.55)',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: radii.xl,
    padding: spacing.md,
    maxHeight: '78%',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A4152',
    marginBottom: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headerText: { flex: 1, gap: spacing.xxs },
  title: { color: TEXT },
  subtitle: { color: MUTED },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#2E2733',
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: { color: MUTED },
  done: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: '#2E2733',
    alignItems: 'center',
  },
  doneText: { color: TEXT },
  loading: { gap: spacing.sm, paddingTop: spacing.md },
  empty: { color: MUTED, paddingTop: spacing.md },
  photoNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  photoNoticeText: { color: CONSENT_NO, flex: 1 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  // Four across, allowing for the gaps between them.
  face: { width: '22%', alignItems: 'center', gap: spacing.xs },
  photoWrap: { position: 'relative' },
  // Overlapping the photo's edge rather than sitting beside it, so the grid
  // keeps its four-across rhythm and the dot always belongs to one face.
  // The diagonal bar across a declined camera. Drawn rather than iconographic
  // because Ionicons has no struck-through camera glyph.
  badgeSlash: {
    position: 'absolute',
    width: 15,
    height: 1.5,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
  },
  badge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 19,
    height: 19,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { width: 56, height: 56, borderRadius: 28 },
  // The lit ring. `shadow*` for iOS, `elevation` does nothing useful here so
  // the border carries it on Android.
  ringLit: {
    borderRadius: 30,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  photoLit: { borderWidth: 2.5, borderColor: '#FFFFFF' },
  // Still full colour — dimming reads as "disabled" rather than "not here yet".
  photoWaiting: { opacity: 0.45 },
  initials: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#3A3340' },
  initialsText: { color: TEXT },
  nameLit: { color: TEXT },
  nameWaiting: { color: FAINT },
});
