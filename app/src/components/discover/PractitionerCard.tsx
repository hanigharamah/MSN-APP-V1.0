import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Avatar, Badge, Card, Skeleton, Text } from '@/components/ui';
import { qk } from '@/lib/queries/keys';
import { getProviderRating } from '@/lib/queries/profiles';
import { aspectRatios, radii, spacing, useTheme } from '@/theme';
import type { Profile } from '@/types/database';
import { Rating, ratingLabel } from './Rating';

export interface PractitionerCardProps {
  profile: Profile;
  onPress: () => void;
  /**
   * Half-width grid card rather than a full-width row.
   *
   * Not a density change — a different composition. The row card puts a small
   * round avatar beside the text, which has nowhere to go at half width. The
   * grid card gives the practitioner's photo the whole top of the card, the way
   * an event gives its cover, so both Discover tabs read as the same kind of
   * thing.
   */
  compact?: boolean;
}

/**
 * A listing row for one practitioner, organiser, business or venue.
 *
 * Follows `Cards/HealerCard.vue`: circular avatar, name, headline, trust
 * badges, star row. DESIGN_SOURCE §5 lists three unrelated healer-card
 * implementations in the web app (one of them with its router link commented
 * out, so it may already be dead); this is the modern one — `surface` fill,
 * hairline border, 8pt radius.
 *
 * `is_verified` and `is_certified` are platform-granted and reverted by a
 * trigger for non-admins (CONVENTIONS §10), so they are read-only signals
 * here, never anything the viewer can act on.
 *
 * ## Why the rating is its own query
 *
 * `searchProviders()` is a PostgREST query over `profiles` and returns no
 * rating, so each card fetches its own via the `provider_rating` RPC, keyed
 * under `qk.profiles.rating(id)`. That is one request per rendered card —
 * mitigated by `FlatList` only mounting what is on screen and by React Query
 * sharing the entry with the provider detail screen, but it is still N+1.
 *
 * Measured against the live project, a full page of 20:
 *
 *   | Shape                                     | Requests | Wall clock |
 *   |-------------------------------------------|----------|------------|
 *   | 20 × `provider_rating`, serialised        | 20       | ~6.2 s     |
 *   | 20 × `provider_rating`, 10 in flight      | 20       | ~1.1 s     |
 *   | one `search_providers` with ratings inline| 1        | ~0.38 s    |
 *
 * So the real fix is worth roughly 16× and it already exists in SQL:
 * `search_providers` returns `rating_average` and `rating_count` on every row.
 * It cannot simply be swapped in, because it takes `limit_n` and **no**
 * `offset_n`, so calling it would trade the N+1 for a list that stops at 20 and
 * cannot page. Both halves are in the handover; neither is fixable from here,
 * because they live in `lib/queries/profiles.ts` and a migration.
 *
 * What IS fixable from here is the repeat cost. The client's default
 * `staleTime` is 30 s, and a card unmounts and remounts every time it scrolls
 * out of and back into the window — so idly scrolling a long list re-fired the
 * same RPC per card every half minute, on top of the initial burst. A rating is
 * an average over reviews that arrive maybe weekly; ten minutes is still far
 * fresher than the data changes.
 */
export function PractitionerCard({ profile, onPress, compact = false }: PractitionerCardProps) {
  const { data: rating } = useQuery({
    queryKey: qk.profiles.rating(profile.id),
    queryFn: () => getProviderRating(profile.id),
    staleTime: 10 * 60_000,
  });

  const place = [profile.city, profile.region].filter(Boolean).join(', ');

  const label = [
    profile.display_name,
    profile.is_verified ? 'Verified' : null,
    profile.is_certified ? 'Certified' : null,
    profile.headline,
    place === '' ? null : place,
    rating ? ratingLabel(rating.average, rating.total) : null,
  ]
    .filter(Boolean)
    .join('. ');

  if (compact) {
    return (
      <Card
        variant="outlined"
        padding="none"
        onPress={onPress}
        accessibilityLabel={label}
        accessibilityHint="Opens the profile"
        style={styles.compactCard}
      >
        {/* The photo, full bleed and square — the same shape and weight the
            event cover has, so the two tabs sit in one visual system. */}
        <View>
          {profile.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={styles.photo}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
              accessible={false}
            />
          ) : (
            // Initials at cover scale rather than an empty grey square: a face
            // is what a person is choosing on, and a blank tile reads as broken.
            <View style={[styles.photo, styles.photoFallback]}>
              <Avatar uri={null} name={profile.display_name} size="xl" />
            </View>
          )}

          {/* On the photo, not under it. These are the two facts that decide
              whether a stranger is worth booking, and the text block at half
              width has no room for a badge row — but the image has corners
              doing nothing. Same move as Airbnb's "Guest favourite".

              Announced once on the card's accessibility label rather than here,
              so a screen reader reads a sentence instead of loose words. */}
          {profile.is_verified || profile.is_certified ? (
            <View style={styles.marks} pointerEvents="none" accessible={false}>
              {profile.is_verified ? <PhotoMark label="Verified" /> : null}
              {profile.is_certified ? <PhotoMark label="Certified" /> : null}
            </View>
          ) : null}
        </View>

        <View style={styles.compactBody}>
          <Text variant="bodySmall" color="heading" numberOfLines={1}>
            {profile.display_name}
          </Text>

          {profile.headline ? (
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {profile.headline}
            </Text>
          ) : null}

          {place === '' ? null : (
            <Text variant="caption" color="muted" numberOfLines={1}>
              {place}
            </Text>
          )}

          {/* Same fixed slot as the row card, for the same reason: the rating
              lands late and a card that grows under a scrolling thumb mis-taps. */}
          <View style={styles.ratingSlot}>
            {rating === undefined ? (
              <Skeleton width={72} height={12} />
            ) : (
              <Rating average={rating.average} total={rating.total} />
            )}
          </View>
        </View>
      </Card>
    );
  }

  return (
    <Card
      variant="outlined"
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint="Opens the profile"
    >
      <View style={styles.row}>
        <Avatar uri={profile.avatar_url} name={profile.display_name} size="lg" />

        <View style={styles.body}>
          <Text variant="h4" color="heading" numberOfLines={1}>
            {profile.display_name}
          </Text>

          {profile.headline ? (
            <Text variant="bodySmall" color="secondary" numberOfLines={2}>
              {profile.headline}
            </Text>
          ) : null}

          {place === '' ? null : (
            <Text variant="caption" color="muted" numberOfLines={1}>
              {place}
            </Text>
          )}

          {profile.is_verified || profile.is_certified ? (
            <View style={styles.badges}>
              {profile.is_verified ? <Badge label="Verified" tone="success" /> : null}
              {profile.is_certified ? <Badge label="Certified" tone="accent" /> : null}
            </View>
          ) : null}

          {/* Fixed-height slot so the card does not grow when the rating
              lands — a list that reflows under a scrolling thumb mis-taps. */}
          <View style={styles.ratingSlot}>
            {rating === undefined ? (
              <Skeleton width={96} height={12} />
            ) : (
              <Rating average={rating.average} total={rating.total} />
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}

/**
 * A trust mark sitting on the photograph.
 *
 * Deliberately not `Badge`: a badge is tinted to its meaning and needs a legible
 * background behind it, and neither holds over an arbitrary photograph. This is
 * a neutral chip — near-opaque surface, heading-coloured text — so it reads the
 * same over a dark portrait as a bright one, which a green-on-green Verified
 * badge would not.
 */
function PhotoMark({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.mark, { backgroundColor: theme.colors.surface }]}>
      <Text variant="label" color="heading" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  marks: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  mark: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  compactCard: {
    // The photo bleeds to the edges, so the corners have to clip it.
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    aspectRatio: aspectRatios.square,
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactBody: {
    padding: spacing.sm,
    gap: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs / 2,
  },
  ratingSlot: {
    minHeight: 18,
    justifyContent: 'center',
    marginTop: spacing.xxs / 2,
  },
});
