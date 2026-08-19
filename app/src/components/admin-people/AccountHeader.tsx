import { StyleSheet, View } from 'react-native';

import { FactList, type Fact } from '@/components/admin';
import { Avatar, Badge, Card, Text } from '@/components/ui';
import { formatLocal } from '@/lib/format';
import { spacing } from '@/theme';
import type { Profile } from '@/types/database';
import { accountTypeLabel, standingBadges, standingSummary } from './standing';

export interface AccountHeaderProps {
  profile: Profile;
}

/**
 * Who this is, and the handful of facts that place them.
 *
 * The join date is here rather than buried in Activity because it is the
 * cheapest signal an operator has: an account created eleven minutes ago that
 * is already asking to be verified is a different decision from one that has
 * been quietly running for two years.
 *
 * Email and phone are shown because an operator handling a report or a
 * verification needs to be able to reach the person and to spot the
 * throwaway-address pattern. They are not copyable-by-tap on purpose — nothing
 * here should make bulk-harvesting contact details convenient.
 *
 * The facts go through the shared `FactList` so an operator who has read a
 * refund screen reads this one the same way, in the same stable label/value
 * order, rather than learning a second layout.
 */
export function AccountHeader({ profile }: AccountHeaderProps) {
  const location = [profile.city, profile.region, profile.country_code]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  const facts: Fact[] = [
    { label: 'Joined', value: formatLocal(profile.created_at) },
    { label: 'Email', value: profile.email ?? 'Not set' },
  ];
  if (profile.phone) facts.push({ label: 'Phone', value: profile.phone });
  if (location) facts.push({ label: 'Location', value: location });
  if (profile.website) facts.push({ label: 'Website', value: profile.website });
  facts.push({ label: 'Time zone', value: profile.timezone });

  return (
    <View style={styles.wrapper}>
      <Card variant="outlined" style={styles.card}>
        <View style={styles.identity}>
          {/* The name is rendered right beside it, so the avatar's own label
              would be read twice. */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Avatar uri={profile.avatar_url} name={profile.display_name} size="xl" />
          </View>

          <View style={styles.identityText}>
            <Text variant="h3" heading={1} numberOfLines={2}>
              {profile.display_name}
            </Text>
            {profile.handle ? (
              <Text variant="bodySmall" color="muted">
                {`@${profile.handle}`}
              </Text>
            ) : null}
            {profile.headline ? (
              <Text variant="bodySmall" color="secondary" numberOfLines={2}>
                {profile.headline}
              </Text>
            ) : null}
          </View>
        </View>

        <View
          style={styles.badges}
          accessible
          accessibilityRole="text"
          accessibilityLabel={standingSummary(profile)}
        >
          <Badge label={accountTypeLabel(profile.account_type)} tone="neutral" />
          {standingBadges(profile).map((badge) => (
            <Badge key={badge.key} label={badge.label} tone={badge.tone} />
          ))}
        </View>
      </Card>

      <FactList title="Account" facts={facts} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.md,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    gap: spacing.xxs,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
});
