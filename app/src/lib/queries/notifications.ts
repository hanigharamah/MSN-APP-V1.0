import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { Notification, PushPlatform, PushToken } from '@/types/database';
import { rangeFor, unwrap, unwrapMaybe } from './client';

/**
 * Notifications and push registration.
 *
 * Rows are written by Edge Functions — there is no client INSERT policy. The
 * client can read its own and mark them read, and that is all.
 *
 * `notifications` is in the `supabase_realtime` publication, so new ones
 * arrive live while the app is open (see `subscribeToNotifications`). Push
 * covers the app being closed; the two are separate paths and both are needed.
 */

export async function listNotifications(profileId: string, page = 0): Promise<Notification[]> {
  const [from, to] = rangeFor(page);
  return unwrap(
    supabase
      .from('notifications')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .range(from, to),
    'load your notifications',
  );
}

export async function countUnreadNotifications(profileId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .is('read_at', null);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await unwrapMaybe(
    supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .select('id'),
    'update that notification',
  );
}

export async function markAllNotificationsRead(profileId: string): Promise<void> {
  await unwrapMaybe(
    supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('profile_id', profileId)
      .is('read_at', null)
      .select('id'),
    'update your notifications',
  );
}

/**
 * Live notifications while the app is foregrounded.
 *
 * The caller must tear the channel down on unmount — `removeChannel`, NOT
 * `unsubscribe()`. See below.
 *
 * ## Why the topic is cleared first
 *
 * `unsubscribe()` closes a channel but leaves it registered with the Realtime
 * client. A later `supabase.channel(topic)` can then hand back that same dead
 * instance, and attaching a `postgres_changes` listener to a channel that has
 * already been subscribed throws:
 *
 *   cannot add `postgres_changes` callbacks for realtime:notifications:<id>
 *   after `subscribe()`
 *
 * Which is a red screen, not a warning. It reproduced reliably by signing out
 * and back in — the sign-out drops the channel, the sign-in asks for the same
 * topic again, and the app died on the tab layout before rendering anything.
 * That path used to be rare because signing out bounced you to a login wall;
 * now that signing out leaves you browsing, it is an ordinary thing to do.
 *
 * Removing any existing channel on this topic first makes the call idempotent:
 * whatever state the previous one was left in, this returns a fresh channel.
 */
export function subscribeToNotifications(
  profileId: string,
  onInsert: (notification: Notification) => void,
): RealtimeChannel {
  const topic = `notifications:${profileId}`;

  for (const existing of supabase.getChannels()) {
    // The client prefixes topics with `realtime:`, so match on either form
    // rather than assuming which one `topic` is stored as.
    if (existing.topic === topic || existing.topic === `realtime:${topic}`) {
      void supabase.removeChannel(existing);
    }
  }

  return supabase
    .channel(topic)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `profile_id=eq.${profileId}`,
      },
      (payload) => onInsert(payload.new as Notification),
    )
    .subscribe();
}

// -----------------------------------------------------------------------------
// Push tokens
// -----------------------------------------------------------------------------

/**
 * Registers this device for push.
 *
 * Upserts on `(profile_id, token)` — the unique index in migration 0002 — so
 * calling it on every launch is safe and keeps `last_seen_at` fresh. A stale
 * token is how you end up pushing to a phone the user sold.
 *
 * TODO(agent · notifications): call this from a hook that
 *   1. asks permission with `Notifications.requestPermissionsAsync()`,
 *   2. gets the Expo push token (needs the EAS project id from
 *      `Constants.expoConfig.extra.eas.projectId`),
 *   3. registers it here,
 *   4. sets the Android notification channel — Android silently drops
 *      notifications with no channel,
 *   5. handles taps by routing to `notifications.deep_link`.
 * Fan-out is an Edge Function's job, not the client's.
 */
export async function registerPushToken(input: {
  profileId: string;
  token: string;
  platform: PushPlatform;
  deviceName?: string;
}): Promise<PushToken> {
  return unwrap(
    supabase
      .from('push_tokens')
      .upsert(
        {
          profile_id: input.profileId,
          token: input.token,
          platform: input.platform,
          device_name: input.deviceName ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id,token' },
      )
      .select('*')
      .single(),
    'register this device for notifications',
  );
}

/** Call on sign-out, so the next person on this device is not pushed their alerts. */
export async function unregisterPushToken(profileId: string, token: string): Promise<void> {
  await unwrapMaybe(
    supabase
      .from('push_tokens')
      .delete()
      .eq('profile_id', profileId)
      .eq('token', token)
      .select('id'),
    'unregister this device',
  );
}
