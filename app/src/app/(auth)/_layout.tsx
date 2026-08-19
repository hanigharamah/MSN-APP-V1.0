import { Stack } from 'expo-router';

import { useTheme } from '@/theme';

/**
 * Auth stack.
 *
 * Headers are hidden — each screen draws its own title so the layout can be
 * generous with vertical space and keep the primary field above the keyboard.
 */
export default function AuthLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="verify-otp" />
    </Stack>
  );
}
