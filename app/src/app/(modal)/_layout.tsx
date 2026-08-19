import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/**
 * Modal stack — detail screens presented over the tabs.
 *
 * Anything you arrive at from a card or a row lives here rather than inside a
 * tab, so the tab bar stays put and a deep link opens the detail with a
 * dismissable frame around it instead of stranding the user with no way back.
 *
 * Add a route by dropping a file in this folder. Keep the segment names in
 * step with `notifications.deep_link` values (`msn://event/<id>`), or push
 * notifications will open the wrong screen.
 */
export default function ModalLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.accent,
        headerTitleStyle: {
          color: theme.colors.textHeading,
          fontFamily: theme.typography.families.semibold,
          fontSize: theme.typography.sizes.md,
        },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
      <Stack.Screen name="service/[id]" options={{ title: 'Service' }} />
      <Stack.Screen name="provider/[id]" options={{ title: 'Profile' }} />
      <Stack.Screen name="booking/[id]" options={{ title: 'Booking' }} />
      <Stack.Screen name="conversation/[id]" options={{ title: 'Conversation' }} />
    </Stack>
  );
}
