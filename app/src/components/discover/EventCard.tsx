import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Avatar, Badge, Card, Text } from '@/components/ui';
import { formatEventRange, timeZoneSuffix } from '@/lib/format';
import { aspectRatios, iconSizes, radii, spacing, useTheme } from '@/theme';
import { locationLabel, priceBadge, type DiscoverEvent } from './event-model';

export interface EventCardProps {
  event: DiscoverEvent;
  onPress: () => void;
  /**
   * Half-width grid card rather than a full-width one.
   *
   * Density only — the card carries the same facts either way. What changes is
   * the cover ratio (a 2:1 landscape crop is unreadable at half width, so it
   * squares up), the padding, and the type sizes.
   */
  compact?: boolean;
}

/**
 * A listing tile for one event.
 *
 * Shape follows `Cards/EventCard.vue` — `surface` fill, hairline border,
 * 8pt radius, 16pt body, a 2:1 cover (`.event-img-landscape`), title, then
 * icon-led meta rows. Two deliberate departures:
 *
 *   - **No `h_170` on the image.** DESIGN_SOURCE §3 flags that the web card
 *     writes `class="event-img-landscape h_170"`, and the fixed height
 *     overrides the ratio it just asked for. The ratio wins here.
 *   - **Press, not hover.** `.card-hover-state` stacks two shadows on hover;
 *     RN has neither hover nor stacked shadows, so `Card` handles the pressed
 *     fill and the card rests flat with its border, which is what the web card
 *     actually looks like when nobody's mouse is on it.
 *
 * ## Time zone
 *
 * The range renders in the EVENT's zone, per CONVENTIONS §8 — a retreat that
 * starts at 9am in Bali starts at 9am in Bali whoever is looking. `timeZoneSuffix`
 * appends the abbreviation only when the viewer is somewhere else, which is
 * what makes that unambiguous instead of merely correct.
 */
export function EventCard({ event, onPress, compact = false }: EventCardProps) {
  const theme = useTheme();

  const when = formatEventRange(event.starts_at, event.ends_at, event.timezone);
  const suffix = timeZoneSuffix(event.timezone, event.starts_at);
  const whenLabel = suffix === null ? when : `${when} ${suffix}`;
  const where = locationLabel(event);

  // Label and tone together, so the two can never disagree — see `priceBadge`
  // for the four states and why "From Free" was a real one.
  const price = priceBadge(event);

  const distance =
    event.distance_km === null ? null : `${event.distance_km.toFixed(event.distance_km < 10 ? 1 : 0)} km away`;

  return (
    <Card
      variant="outlined"
      padding="none"
      onPress={onPress}
      accessibilityLabel={[
        event.is_retreat ? 'Retreat' : null,
        event.title,
        event.host ? `Hosted by ${event.host.display_name}` : null,
        whenLabel,
        where,
        price.label,
        distance,
      ]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint="Opens the event"
      style={styles.card}
    >
      <View>
      {event.cover_url ? (
        <Image
          source={{ uri: event.cover_url }}
          style={[
            styles.cover,
            compact ? styles.coverCompact : null,
            { backgroundColor: theme.colors.surfaceMuted },
          ]}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          accessible={false}
        />
      ) : (
        <View
          style={[
            styles.cover,
            compact ? styles.coverCompact : null,
            styles.coverFallback,
            { backgroundColor: theme.colors.surfaceMuted },
          ]}
        >
          <Ionicons
            name="calendar-outline"
            size={iconSizes.xl}
            color={theme.colors.textPlaceholder}
          />
        </View>
      )}

      {/* On the cover rather than in the body. The compact card has no badge
          row at all — it was dropped to keep two per row readable — so a label
          in the body would either not appear on the grid or push the title
          down. Over the image it costs no layout and survives both densities. */}
      {event.is_retreat ? (
        <View style={[styles.retreat, { backgroundColor: theme.colors.scrim }]}>
          <Ionicons name="leaf" size={11} color="#FFFFFF" />
          <Text variant="caption" style={styles.retreatText}>
            Retreat
          </Text>
        </View>
      ) : null}
      </View>

      <View style={[styles.body, compact ? styles.bodyCompact : null]}>
        {compact ? null : (
          <View style={styles.badges}>
            <Badge label={price.label} tone={price.tone} />
            {distance === null ? null : <Badge label={distance} tone="accent" />}
          </View>
        )}

        <Text
          variant={compact ? 'bodySmall' : 'h4'}
          color="heading"
          numberOfLines={2}
          style={compact ? styles.titleCompact : null}
        >
          {event.title}
        </Text>

        {/* The host, directly under the title. MSN is a marketplace built on
            people — a seeker picks a circle because of who leads it — and the
            card used to name the venue and the date and never the practitioner.
            Placed above the meta rows because it outranks them: who is running
            it decides whether the when and where matter at all. */}
        {event.host ? (
          <View style={styles.host}>
            <Avatar
              uri={event.host.avatar_url}
              name={event.host.display_name}
              size="xs"
              style={compact ? styles.hostAvatarCompact : undefined}
            />
            <Text
              variant={compact ? 'caption' : 'bodySmall'}
              color="secondary"
              numberOfLines={1}
              style={styles.hostName}
            >
              {event.host.display_name}
            </Text>
            {event.host.is_verified && !compact ? <Badge label="Verified" tone="success" /> : null}
          </View>
        ) : null}

        <View style={styles.meta}>
          <MetaRow icon="calendar-outline" text={whenLabel} compact={compact} />
          {compact ? (
            <Text variant="caption" color="heading" numberOfLines={1}>
              {price.label}
            </Text>
          ) : (
            <MetaRow
              icon={event.delivery_mode === 'in_person' ? 'location-outline' : 'videocam-outline'}
              text={where}
            />
          )}
        </View>
      </View>
    </Card>
  );
}

function MetaRow({
  icon,
  text,
  compact = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  compact?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.metaRow}>
      <Ionicons
        name={icon}
        size={iconSizes.xs}
        color={theme.colors.textSecondary}
        // Optically centres a 16pt glyph against a 20pt line box.
        style={styles.metaIcon}
      />
      <Text
        variant={compact ? 'caption' : 'bodySmall'}
        color="secondary"
        // One line in the grid: a wrapped date makes two side-by-side cards
        // different heights, and the row then aligns to the taller one.
        numberOfLines={compact ? 1 : 2}
        style={styles.metaText}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  retreat: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  retreatText: { color: '#FFFFFF' },
  host: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hostName: { flexShrink: 1 },
  card: {
    // The cover bleeds to the card's edges, so the corners have to clip it.
    overflow: 'hidden',
  },
  coverCompact: {
    // 2:1 is a letterbox at half width — barely any subject survives the crop.
    aspectRatio: aspectRatios.square,
  },
  bodyCompact: {
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  titleCompact: {
    // The default line height is set for a heading with air around it. In a
    // two-line grid title it is most of the card's text block.
    lineHeight: 18,
  },
  hostAvatarCompact: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  cover: {
    width: '100%',
    aspectRatio: aspectRatios.landscape,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  meta: {
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  metaIcon: {
    marginTop: 2,
  },
  metaText: {
    flex: 1,
  },
});
