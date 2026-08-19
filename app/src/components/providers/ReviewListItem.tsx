import { StyleSheet, View } from 'react-native';

import { Avatar, Card, Text } from '@/components/ui';
import { formatRelative } from '@/lib/format';
import type { ReviewWithAuthor } from '@/lib/queries/profiles';
import { spacing } from '@/theme';
import { RatingStars } from './RatingStars';

export interface ReviewListItemProps {
  review: ReviewWithAuthor;
}

/**
 * One review.
 *
 * `created_at` is a platform event — it is about when someone wrote something,
 * not about an offering happening somewhere — so it renders relative to now in
 * the viewer's zone via `formatRelative`, not in any offering's zone.
 *
 * A review with no author row is one whose author has been suspended; RLS hides
 * the profile but leaves the review, so the name falls back rather than
 * crashing on `null.display_name`.
 */
export function ReviewListItem({ review }: ReviewListItemProps) {
  const name = review.author?.display_name ?? 'Former member';

  return (
    <Card variant="outlined" padding="sm">
      <View style={styles.header}>
        <Avatar uri={review.author?.avatar_url ?? null} name={name} size="md" />
        <View style={styles.identity}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" color="muted">
            {formatRelative(review.created_at)}
          </Text>
        </View>
        <RatingStars average={review.rating} total={1} size="sm" starsOnly />
      </View>

      {review.body ? (
        <Text variant="body" color="secondary" style={styles.body}>
          {review.body}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  identity: {
    flex: 1,
  },
  body: {
    marginTop: spacing.xs,
  },
});
