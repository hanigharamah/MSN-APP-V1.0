import { StyleSheet, View } from 'react-native';

import { Avatar, Badge, Text } from '@/components/ui';
import { spacing } from '@/theme';
import { isProviderAccount, type AccountType, type Profile } from '@/types/database';

export interface ProfileHeaderProps {
  profile: Profile;
}

const ACCOUNT_LABEL: Record<AccountType, string> = {
  seeker: 'Seeker',
  practitioner: 'Practitioner',
  business: 'Business',
  venue: 'Venue',
  nonprofit: 'Non-profit',
  organizer: 'Organiser',
};

/** Human label for `profiles.account_type`. Read-only everywhere it appears. */
export function accountTypeLabel(accountType: AccountType): string {
  return ACCOUNT_LABEL[accountType];
}

/**
 * The signed-in user's identity block.
 *
 * Everything here is read-only ON PURPOSE, and the badges are the reason.
 * `is_verified`, `is_certified`, `is_admin` and `account_type` are reverted by
 * `guard_profile_trust_flags` for non-admins: a write appears to succeed and
 * changes nothing. Rendering them as `Badge` (non-interactive) rather than
 * `Chip` (interactive) is the visual half of that contract — a chip announces
 * as a checkbox and invites a tap that can never work.
 *
 * The whole block is one accessibility node so the name, handle and status are
 * heard as one identity rather than five stops.
 */
export function ProfileHeader({ profile }: ProfileHeaderProps) {
  const accountType = accountTypeLabel(profile.account_type);

  const label = [
    profile.display_name,
    profile.handle ? `at ${profile.handle}` : null,
    accountType,
    profile.headline,
    profile.is_verified ? 'Verified by My Source Network' : null,
    profile.is_certified ? 'Certified' : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View style={styles.container} accessible accessibilityRole="summary" accessibilityLabel={label}>
      <Avatar uri={profile.avatar_url} name={profile.display_name} size="xl" />

      <View style={styles.copy}>
        <Text variant="h3" heading={1} numberOfLines={2}>
          {profile.display_name}
        </Text>

        {profile.handle ? (
          <Text variant="bodySmall" color="muted">
            @{profile.handle}
          </Text>
        ) : null}

        {profile.headline ? (
          <Text variant="bodySmall" color="secondary" numberOfLines={2}>
            {profile.headline}
          </Text>
        ) : null}

        <View style={styles.badges}>
          <Badge
            label={accountType}
            tone={isProviderAccount(profile.account_type) ? 'accent' : 'neutral'}
          />
          {profile.is_verified ? <Badge label="Verified" tone="success" /> : null}
          {profile.is_certified ? <Badge label="Certified" tone="accent" /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  copy: {
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
