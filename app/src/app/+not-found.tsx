import { useRouter } from 'expo-router';

import { EmptyState, Screen } from '@/components/ui';

/**
 * Reached by a deep link to a route that does not exist — usually an old
 * `notifications.deep_link` after a route was renamed, or a shared link from a
 * newer build.
 */
export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen>
      <EmptyState
        icon="help-circle-outline"
        title="This page does not exist"
        description="The link may be out of date, or the thing it pointed at may have been removed."
        actionLabel="Go to Discover"
        onAction={() => router.replace('/(tabs)')}
      />
    </Screen>
  );
}
