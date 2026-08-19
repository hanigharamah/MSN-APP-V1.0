import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Badge, Text } from '@/components/ui';
import { formatEventDate, timeZoneSuffix } from '@/lib/format';
import type { Profile, ProviderDetails, Speciality } from '@/types/database';
import { radii, spacing, useTheme } from '@/theme';
import { isCrossTimeZone } from './booking-time';
import { locationLabel } from './labels';

export interface AboutPanelProps {
  profile: Profile;
  /** `null` when this profile has no provider row — a seeker, or incomplete. */
  details: ProviderDetails | null;
  specialities: readonly Speciality[];
}

/**
 * The About tab: bio, specialities, languages, experience and working zone.
 *
 * The timezone line is deliberate. A seeker booking a session needs to know
 * that "10:00" on the practitioner's side is not the "10:00" they are about to
 * tap, and the profile is where that expectation is set — before the slot
 * picker, not after it.
 */
export function AboutPanel({ profile, details, specialities }: AboutPanelProps) {
  const theme = useTheme();

  const location = locationLabel(profile);
  const zoneSuffix = timeZoneSuffix(profile.timezone);
  const crossZone = isCrossTimeZone(profile.timezone);
  const languages = details?.languages ?? [];

  return (
    <View style={styles.container}>
      <Text variant="h3" heading={2}>
        About
      </Text>

      {profile.bio ? (
        <Text variant="body" color="secondary">
          {profile.bio}
        </Text>
      ) : (
        <Text variant="body" color="muted">
          {`${profile.display_name} has not written a bio yet.`}
        </Text>
      )}

      {specialities.length > 0 ? (
        <View style={styles.section}>
          <Text variant="bodyStrong" heading={3}>
            Specialities
          </Text>
          <View style={styles.wrap}>
            {specialities.map((speciality) => (
              <Badge key={speciality.id} label={speciality.name} tone="accent" />
            ))}
          </View>
        </View>
      ) : null}

      {languages.length > 0 ? (
        <View style={styles.section}>
          <Text variant="bodyStrong" heading={3}>
            Languages
          </Text>
          <View style={styles.wrap}>
            {languages.map((language) => (
              <Badge key={language} label={language} tone="neutral" />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        {details?.years_experience ? (
          <Row
            icon="ribbon-outline"
            text={`${details.years_experience} ${
              details.years_experience === 1 ? 'year' : 'years'
            } of experience`}
            color={theme.colors.textMuted}
          />
        ) : null}

        {location ? (
          <Row icon="location-outline" text={location} color={theme.colors.textMuted} />
        ) : null}

        <Row
          icon="globe-outline"
          text={
            crossZone
              ? `Works in ${profile.timezone}${zoneSuffix ? ` (${zoneSuffix})` : ''} — a different timezone from yours`
              : `Works in ${profile.timezone} — the same timezone as you`
          }
          color={theme.colors.textMuted}
        />

        {profile.website ? (
          <Row icon="link-outline" text={profile.website} color={theme.colors.textMuted} />
        ) : null}
      </View>

      {details && !details.accepts_bookings ? (
        <View style={[styles.notice, { backgroundColor: theme.colors.warningSubtle }]}>
          <Text variant="bodySmall" color="warning">
            {`${profile.display_name} is not taking new bookings right now.`}
          </Text>
        </View>
      ) : null}

      {details?.is_out_of_office ? (
        <View style={[styles.notice, { backgroundColor: theme.colors.warningSubtle }]}>
          <Text variant="bodySmall" color="warning">
            {details.out_of_office_until
              ? `Away until ${formatEventDate(details.out_of_office_until, profile.timezone)}.`
              : 'Away at the moment.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Row({
  icon,
  text,
  color,
}: {
  icon: 'ribbon-outline' | 'location-outline' | 'globe-outline' | 'link-outline';
  text: string;
  color: string;
}) {
  return (
    <View style={styles.row} accessible accessibilityLabel={text}>
      <Ionicons name={icon} size={16} color={color} />
      <Text variant="bodySmall" color="muted" style={styles.rowText}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  section: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xxs,
  },
  rowText: {
    flex: 1,
  },
  notice: {
    padding: spacing.sm,
    borderRadius: radii.lg,
    marginTop: spacing.xs,
  },
});
