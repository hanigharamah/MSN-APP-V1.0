import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Avatar, Badge, Button, Text } from '@/components/ui';
import type { ProviderRating } from '@/lib/queries/profiles';
import type { Profile } from '@/types/database';
import { avatarSizes, radii, SCREEN_GUTTER, spacing, useTheme } from '@/theme';
import { locationLabel } from './labels';
import { RatingStars } from './RatingStars';

/**
 * Cover height on a phone. DESIGN_SOURCE §6.3: the web app renders 120 below
 * 768px, growing to 200 and 280 at wider breakpoints we do not have.
 */
const COVER_HEIGHT = 120;
/** The avatar's diameter — `avatarSizes.xxl`. */
const AVATAR = avatarSizes.xxl;
/**
 * How far the avatar rides up over the cover.
 *
 * The web app has four competing overlap systems and the `!important`
 * stylesheet rule wins over the inline percentages: `.avatar-2` is
 * `margin-top: -75px` below 576px, which is the phone case. So the avatar's
 * centre sits just below the cover's bottom edge.
 */
const AVATAR_OVERLAP = 75;
/** White pad between the avatar and the cover, as `.shadow`-ringed on the web. */
const AVATAR_RING = 4;

export interface ProfileHeaderProps {
  profile: Profile;
  rating: ProviderRating | undefined;
  /** `null` while the follow state is still unknown. */
  /**
   * `true` / `false` once known. `null` means the follow state has not loaded —
   * which now covers two different situations, so `signedIn` disambiguates:
   * a signed-in viewer whose query is still in flight (disable, nothing sane to
   * do yet) versus a signed-out viewer who will never have one (keep it live,
   * the tap is what sends them to sign in).
   */
  isFollowing: boolean | null;
  /** False when nobody is signed in. Keeps Follow tappable rather than dead. */
  signedIn: boolean;
  followPending: boolean;
  onToggleFollow: () => void;
  messagePending: boolean;
  onMessage: () => void;
  /** Hides the follow and message actions — you cannot follow yourself. */
  isSelf: boolean;
}

/**
 * The profile header: cover, overlapping avatar, name, trust badges, headline,
 * rating and the two relationship actions.
 *
 * `is_verified` and `is_certified` are platform-granted and reverted by a
 * trigger for anyone but an admin, so they are rendered as read-only badges and
 * never as anything tappable.
 */
export function ProfileHeader({
  profile,
  rating,
  isFollowing,
  signedIn,
  followPending,
  onToggleFollow,
  messagePending,
  onMessage,
  isSelf,
}: ProfileHeaderProps) {
  const theme = useTheme();
  const location = locationLabel(profile);

  return (
    <View>
      <View style={[styles.cover, { backgroundColor: theme.colors.surfaceMuted }]}>
        {profile.cover_url ? (
          <Image
            source={{ uri: profile.cover_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>

      <View style={styles.body}>
        <View
          style={[
            styles.avatarRing,
            {
              backgroundColor: theme.colors.surface,
              // Pull the ring up by the overlap plus its own pad, so it is the
              // avatar — not the ring — that overlaps by exactly 75.
              marginTop: -(AVATAR_OVERLAP + AVATAR_RING),
            },
          ]}
        >
          <Avatar uri={profile.avatar_url} name={profile.display_name} size="xxl" />
        </View>

        <Text variant="h2" heading={1} style={styles.name}>
          {profile.display_name}
        </Text>

        {profile.handle ? (
          <Text variant="bodySmall" color="muted">
            {`@${profile.handle}`}
          </Text>
        ) : null}

        {profile.is_verified || profile.is_certified ? (
          <View style={styles.badges}>
            {profile.is_verified ? <Badge label="Verified" tone="success" /> : null}
            {profile.is_certified ? <Badge label="Certified" tone="accent" /> : null}
          </View>
        ) : null}

        {profile.headline ? (
          <Text variant="body" color="secondary" style={styles.headline}>
            {profile.headline}
          </Text>
        ) : null}

        <RatingStars
          average={rating?.average ?? null}
          total={rating?.total ?? 0}
          size="sm"
          style={styles.rating}
        />

        {location ? (
          <View style={styles.metaRow} accessible accessibilityLabel={`Based in ${location}`}>
            <Ionicons name="location-outline" size={16} color={theme.colors.textMuted} />
            <Text variant="bodySmall" color="muted">
              {location}
            </Text>
          </View>
        ) : null}

        {isSelf ? null : (
          <View style={styles.actions}>
            <Button
              label={isFollowing ? 'Following' : 'Follow'}
              variant={isFollowing ? 'secondary' : 'primary'}
              onPress={onToggleFollow}
              loading={followPending}
              disabled={signedIn && isFollowing === null}
              accessibilityLabel={
                isFollowing
                  ? `Unfollow ${profile.display_name}`
                  : `Follow ${profile.display_name}`
              }
              style={styles.action}
            />
            <Button
              label="Message"
              variant="secondary"
              onPress={onMessage}
              loading={messagePending}
              accessibilityLabel={`Message ${profile.display_name}`}
              style={styles.action}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    height: COVER_HEIGHT,
    width: '100%',
    overflow: 'hidden',
  },
  body: {
    paddingHorizontal: SCREEN_GUTTER,
  },
  avatarRing: {
    width: AVATAR + AVATAR_RING * 2,
    height: AVATAR + AVATAR_RING * 2,
    borderRadius: radii.full,
    padding: AVATAR_RING,
    alignSelf: 'flex-start',
  },
  name: {
    marginTop: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  headline: {
    marginTop: spacing.xs,
  },
  rating: {
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  action: {
    flex: 1,
  },
});
