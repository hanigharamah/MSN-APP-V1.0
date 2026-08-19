import { Redirect, Stack, router } from 'expo-router';
import { Pressable } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

/**
 * Admin — the operator's side of the marketplace.
 *
 * ## The shape of this area
 *
 * This is a queue of decisions, not a database browser. Most admin tools fail
 * the same way: they mirror the schema, hand you every table, and leave you to
 * work out what needs doing. The only question an operator actually opens this
 * with is "what needs me right now?", so that is the home screen, and
 * everything else is reachable from the item that raised it.
 *
 * Consequences of that:
 *   - No table list. No record browser. Search exists for when you already know
 *     who or what you are looking for.
 *   - Every item in the queue is something a person is waiting on — a refund
 *     undecided, a report unhandled, a practitioner unverified.
 *   - An empty queue is a real, welcome state, not a bug.
 *
 * ## The gate
 *
 * `is_admin` on the profile. This is convenience, not security — RLS is what
 * protects the data, and every admin policy checks `auth_is_admin()`
 * server-side. A non-admin who forced their way here would see empty lists and
 * every write would be refused.
 *
 * `Redirect` rather than a push, because these screens are deep-linkable and
 * the guard has to hold on a cold start with no history.
 */
export default function AdminLayout() {
  const { session, profile, initialising, profileLoading } = useAuth();
  const theme = useTheme();

  if (initialising || profileLoading) return null;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (profile && !profile.is_admin) return <Redirect href="/(tabs)/profile" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTitleStyle: { color: theme.colors.textHeading },
        headerTintColor: theme.colors.accent,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Admin',
          // Admin is pushed from Profile, so iOS gives the deeper screens a
          // back chevron — but the root of a pushed stack gets none, and this
          // stack has no tab bar under it. That left the only exit as
          // force-quitting the app: no back, no close, and Sign out lives in
          // Profile which you could no longer reach.
          headerLeft: () => (
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Leave admin"
            >
              <Text variant="body" style={{ color: theme.colors.accent }}>
                Done
              </Text>
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="refunds/[id]" options={{ title: 'Refund request' }} />
      <Stack.Screen name="reports/[id]" options={{ title: 'Report' }} />
      <Stack.Screen name="people/index" options={{ title: 'Find someone' }} />
      <Stack.Screen name="people/[id]" options={{ title: 'Account' }} />
      <Stack.Screen name="listings/index" options={{ title: 'Find a listing' }} />
      <Stack.Screen name="money" options={{ title: 'Money' }} />
    </Stack>
  );
}
