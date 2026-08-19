import { QueryClient } from '@tanstack/react-query';

import { isAppError } from './errors';

/**
 * React Query configuration.
 *
 * Defaults tuned for a mobile marketplace on an unreliable connection:
 *
 * - `staleTime: 30s` — a listing does not change second to second, and every
 *   avoided refetch is battery and data the seeker keeps.
 * - `gcTime: 30m` — cache survives a tab switch and a short background stint,
 *   so returning to Discover is instant.
 * - Retries respect `AppError.retryable`. Retrying a `forbidden` is pointless
 *   and retrying an `auth` failure just burns the rate limit before the user
 *   is redirected to sign in.
 * - Mutations never retry by default. A retried "create booking" is a double
 *   booking; opt in per mutation where the call is genuinely idempotent.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 30 * 60_000,
        retry: (failureCount, error) => {
          if (failureCount >= 2) return false;
          if (isAppError(error)) return error.retryable;
          return true;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        // React Native has no window focus; expo-router remounts screens
        // instead, and `refetchOnMount` covers that.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
