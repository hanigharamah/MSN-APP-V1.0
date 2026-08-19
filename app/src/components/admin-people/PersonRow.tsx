import { StyleSheet, View } from 'react-native';

import { Avatar, Badge, Card, Text } from '@/components/ui';
import { spacing } from '@/theme';
import type { Profile } from '@/types/database';
import { accountTypeLabel, standingBadges, standingSummary } from './standing';

export interface PersonRowProps {
  profile: Profile;
  onPress: () => void;
}

/**
 * One search result: who they are, what kind of account, and where they stand.
 *
 * Those three things and nothing else. A result row that also carried joined
 * dates, booking counts and city would be the database browser this area is
 * explicitly not — the operator picks a person here and reads the rest on the
 * account screen.
 *
 * The whole row is one accessible node with a composed label, per
 * CONVENTIONS §6: a screen reader should say "Maya Okonkwo, maya,
 * practitioner, verified" once, not walk five separate stops.
 */
export function PersonRow({ profile, onPress }: PersonRowProps) {
  const badges = standingBadges(profile);
  const secondary = profile.handle ? `@${profile.handle}` : (profile.email ?? 'No handle or email');

  return (
    <Card
      variant="outlined"
      onPress={onPress}
      accessibilityLabel={`${profile.display_name}, ${secondary}, ${standingSummary(profile)}`}
      accessibilityHint="Opens their account"
      style={styles.card}
    >
      <View style={styles.row}>
        <Avatar uri={profile.avatar_url} name={profile.display_name} size="md" />

        <View style={styles.body}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {profile.display_name}
          </Text>
          <Text variant="caption" color="muted" numberOfLines={1}>
            {secondary}
          </Text>

          <View style={styles.badges}>
            <Badge label={accountTypeLabel(profile.account_type)} tone="neutral" />
            {badges
              .filter((badge) => badge.key !== 'none')
              .map((badge) => (
                <Badge key={badge.key} label={badge.label} tone={badge.tone} />
              ))}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
});
