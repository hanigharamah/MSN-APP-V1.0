import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Registering this device to receive push notifications.
 *
 * ## What was already here, and what was not
 *
 * The server half has been complete for a long time: `push_tokens`, the
 * `send-push` function, Expo fan-out, dead-token cleanup, and a `notifyUser`
 * call on every event worth telling somebody about. All of it ran, and none of
 * it reached a phone, because `push_tokens` was empty — nothing ever registered
 * a device. This is that missing step, and it is the whole of the gap.
 *
 * ## Permission is asked for, never assumed
 *
 * `getPermissionsAsync` first. If somebody has already refused, this returns
 * quietly rather than prompting again — iOS only shows the system prompt once,
 * so a second request is a silent no-op that reads like a bug when you are
 * debugging it.
 *
 * ## A missing token is not an error
 *
 * Returns a reason rather than throwing. Push is a nudge on top of the
 * notification row, which is durable and shows in the bell regardless — so a
 * device that cannot register is degraded, not broken, and the caller carries
 * on.
 */
export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: 'not-a-device' | 'denied' | 'no-project-id' | 'error'; detail?: string };

export async function registerForPush(profileId: string): Promise<PushRegistration> {
  // The iOS Simulator has no APNs connection and can never receive a remote
  // push; Android emulators can. Checked explicitly so the failure reads as
  // "this device cannot" rather than as a bug in the code below.
  if (!Device.isDevice) return { ok: false, reason: 'not-a-device' };

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status === 'undetermined') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return { ok: false, reason: 'denied' };

  // Required since SDK 49. Without it `getExpoPushTokenAsync` throws, and the
  // message is about the project rather than about push — confusing at the
  // point of failure, so it is caught here and named.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  if (!projectId) {
    return {
      ok: false,
      reason: 'no-project-id',
      detail:
        'EAS_PROJECT_ID is not set. Expo push tokens are issued against an EAS project; without one no token can be minted.',
    };
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    // Upsert on the table's unique key. Re-registering the same device must not
    // add a row, or one person on one phone accumulates a token per launch and
    // then receives one push per row.
    const { error } = await supabase.from('push_tokens').upsert(
      {
        profile_id: profileId,
        token,
        platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
        device_name: Device.deviceName ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id,token' },
    );
    if (error) return { ok: false, reason: 'error', detail: error.message };

    return { ok: true, token };
  } catch (err) {
    return { ok: false, reason: 'error', detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Forget this device on sign-out.
 *
 * Without it the next push for the previous account lands on a phone somebody
 * else is now signed into — a message preview on a stranger's lock screen. The
 * row outlives the session, so it has to be removed deliberately.
 */
export async function unregisterPush(profileId: string, token: string): Promise<void> {
  await supabase.from('push_tokens').delete().eq('profile_id', profileId).eq('token', token);
}
