import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/theme';
import { isProviderAccount } from '@/types/database';

/**
 * Provider tools — the supply side of the marketplace.
 *
 * Everything under here is for someone who lists things: their services,
 * their events, their working hours, their payouts.
 *
 * ## Why the gate is here and not on each screen
 *
 * A seeker reaching any of these would see a screen that can only ever be
 * empty — they have nothing to list. Gating once at the layout means a new
 * provider screen is protected the moment it is added, rather than relying on
 * whoever adds it to remember.
 *
 * The redirect is a `Redirect`, not a router push: these screens are
 * deep-linkable (`msn://services`), so the guard has to hold on a cold start
 * with no history to go back to.
 *
 * ## This is convenience, not security
 *
 * RLS is what actually protects the data — every provider-owned write policy
 * checks `provider_id = auth.uid()`, so a seeker who forced their way here
 * still could not create or edit anything. This gate exists so nobody is shown
 * a door that leads nowhere.
 */
export default function ProviderLayout() {
  const { session, profile, initialising, profileLoading } = useAuth();
  const theme = useTheme();

  // Wait for both the restored session and the profile row before deciding.
  // Redirecting while either is still loading would bounce a provider out of
  // their own tools on every cold start.
  if (initialising || profileLoading) return null;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (profile && !isProviderAccount(profile.account_type)) {
    return <Redirect href="/(tabs)/profile" />;
  }

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
      <Stack.Screen name="services/index" options={{ title: 'My services' }} />
      <Stack.Screen name="services/new" options={{ title: 'New service' }} />
      <Stack.Screen name="services/[id]" options={{ title: 'Edit service' }} />
      <Stack.Screen name="events/index" options={{ title: 'My events' }} />
      <Stack.Screen name="events/new" options={{ title: 'New event' }} />
      <Stack.Screen name="events/[id]" options={{ title: 'Edit event' }} />
      <Stack.Screen name="check-in/[id]" options={{ title: 'Check in' }} />
      {/* No `availability` screen: booking hours now live inside the service
          they govern, and the accepting-bookings switch on Profile. See
          `components/provider-tools/availability/index.ts`. */}
    </Stack>
  );
}
