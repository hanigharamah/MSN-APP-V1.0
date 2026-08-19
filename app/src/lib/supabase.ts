// Must be the first import in the module graph that touches supabase-js.
// React Native's URL implementation is incomplete; supabase-js and its
// PostgREST/Realtime clients build request URLs with `URL` and `URLSearchParams`
// and will silently produce malformed requests without this.
import 'react-native-url-polyfill/auto';

import { AppState, Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';
import { secureStoreAdapter } from './secure-store-adapter';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY.\n' +
      'Copy .env.example to .env, fill both in, then restart the dev server ' +
      'with `npx expo start --clear` (env vars are inlined at bundle time, so ' +
      'a hot reload will not pick them up).',
  );
}

/**
 * The one Supabase client for the app.
 *
 * Typed with `Database`, so `.from('events').select('*')` returns
 * `EventRow[]` and a typo in a column name is a compile error. Never call
 * `createClient` anywhere else — a second client means a second auth listener
 * and two competing token refreshes.
 *
 * The anon key is public by design. Every table has RLS enabled (0006) and
 * nothing is readable that the policies do not allow, so shipping this key in
 * the bundle is safe. The service-role key is not, and must never appear in
 * this codebase.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: secureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // Native apps have no URL fragment to parse; leaving this on makes
      // supabase-js touch `window.location` and warn.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: {
      headers: {
        'x-msn-client': `expo-${Platform.OS}`,
      },
    },
    realtime: {
      params: {
        // Messaging is the only high-frequency channel; this is plenty.
        eventsPerSecond: 10,
      },
    },
  },
);

/**
 * Supabase refreshes the access token on a timer. On mobile that timer does
 * not run while the app is backgrounded, so without this the first request
 * after a long background stint fails with an expired JWT before the retry
 * kicks in. Pausing and resuming the refresher around app state fixes it.
 *
 * Registered once at module load, which is correct because the client is a
 * singleton.
 */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
