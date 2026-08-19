import { StyleSheet, View } from 'react-native';

import { AdminNotice } from '@/components/admin';
import { RatingStars } from '@/components/providers';
import { Badge, Card, Text, eventStatusBadge } from '@/components/ui';
import { formatEventDate, formatMoney, formatRelative } from '@/lib/format';
import { borderWidths, spacing, useTheme } from '@/theme';
import type { AccountActivity, VerificationEvidence } from './admin-queries';

export interface VerificationEvidencePanelProps {
  evidence: VerificationEvidence;
  activity: AccountActivity;
}

/**
 * What the operator is being asked to vouch for.
 *
 * This panel is the reason the verify decision is not a switch. The Verified
 * badge is the trust signal the entire marketplace leans on — it is what a
 * seeker uses to decide whether to be alone in a room with someone — and until
 * this screen existed nobody could grant it at all. Granting it from a name and
 * an email would make the badge mean "an operator saw a row", which is worth
 * nothing to the person relying on it.
 *
 * So: their listings, their reviews, and whether they have ever actually
 * delivered a session. Nothing here is the decision; all of it is the basis
 * for one. Identity documents are not in the schema at all — see the note the
 * account screen renders alongside this.
 */
export function VerificationEvidencePanel({
  evidence,
  activity,
}: VerificationEvidencePanelProps) {
  const theme = useTheme();

  const hasNothing =
    evidence.events.length === 0 &&
    evidence.services.length === 0 &&
    evidence.reviews.length === 0 &&
    activity.completedAsProvider === 0;

  const dividerStyle = {
    borderTopColor: theme.colors.border,
    borderTopWidth: borderWidths.hairline,
  };

  return (
    <Card variant="outlined" style={styles.card}>
      <Text variant="h4" heading={2}>
        What you would be vouching for
      </Text>

      {hasNothing ? (
        <AdminNotice
          tone="warning"
          title="Nothing to go on"
          body="No listings, no reviews, no completed sessions. There is nothing here that supports a Verified badge yet."
        />
      ) : null}

      {/* --- Delivered ---------------------------------------------------- */}
      <View style={styles.line}>
        <Text variant="bodySmall" color="secondary">
          Sessions completed
        </Text>
        <Text variant="bodyStrong">{activity.completedAsProvider}</Text>
      </View>

      <View style={styles.line}>
        <Text variant="bodySmall" color="secondary">
          Rating
        </Text>
        <RatingStars average={evidence.rating.average} total={evidence.rating.total} size="sm" />
      </View>

      {/* --- Listings ----------------------------------------------------- */}
      {evidence.events.length > 0 ? (
        <View style={[styles.section, dividerStyle]}>
          <Text variant="label" color="secondary">
            {`Events (${evidence.events.length} most recent)`}
          </Text>
          {evidence.events.map((event) => {
            const status = eventStatusBadge(event.status);
            return (
              <View
                key={event.id}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${event.title}, ${status.label}, ${formatEventDate(event.starts_at, event.timezone)}`}
                style={styles.itemRow}
              >
                <View style={styles.itemText}>
                  <Text variant="bodySmall" numberOfLines={1}>
                    {event.title}
                  </Text>
                  <Text variant="caption" color="muted">
                    {formatEventDate(event.starts_at, event.timezone)}
                  </Text>
                </View>
                <Badge label={status.label} tone={status.tone} />
              </View>
            );
          })}
        </View>
      ) : null}

      {evidence.services.length > 0 ? (
        <View style={[styles.section, dividerStyle]}>
          <Text variant="label" color="secondary">
            {`Services (${evidence.services.length} shown)`}
          </Text>
          {evidence.services.map((service) => (
            <View
              key={service.id}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${service.title}, ${formatMoney(service.price_cents, service.currency)}, ${service.is_active ? 'active' : 'paused'}`}
              style={styles.itemRow}
            >
              <View style={styles.itemText}>
                <Text variant="bodySmall" numberOfLines={1}>
                  {service.title}
                </Text>
                <Text variant="caption" color="muted">
                  {formatMoney(service.price_cents, service.currency)}
                </Text>
              </View>
              <Badge
                label={service.is_active ? 'Active' : 'Paused'}
                tone={service.is_active ? 'success' : 'neutral'}
              />
            </View>
          ))}
        </View>
      ) : null}

      {/* --- Reviews ------------------------------------------------------ */}
      {evidence.reviews.length > 0 ? (
        <View style={[styles.section, dividerStyle]}>
          <Text variant="label" color="secondary">
            {`Recent reviews (${evidence.reviews.length} shown)`}
          </Text>
          {evidence.reviews.map((review) => (
            <View
              key={review.id}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${review.rating} out of 5 from ${review.author?.display_name ?? 'a deleted account'}${review.is_hidden ? ', hidden' : ''}. ${review.body ?? 'No comment.'}`}
              style={styles.review}
            >
              <View style={styles.reviewHead}>
                <RatingStars average={review.rating} total={1} size="sm" starsOnly />
                <Text variant="caption" color="muted" numberOfLines={1} style={styles.itemText}>
                  {`${review.author?.display_name ?? 'Deleted account'} · ${formatRelative(review.created_at)}`}
                </Text>
                {review.is_hidden ? <Badge label="Hidden" tone="warning" /> : null}
              </View>
              {review.body ? (
                <Text variant="bodySmall" color="secondary" numberOfLines={4}>
                  {review.body}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  section: {
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemText: {
    flex: 1,
  },
  review: {
    gap: spacing.xxs,
  },
  reviewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
