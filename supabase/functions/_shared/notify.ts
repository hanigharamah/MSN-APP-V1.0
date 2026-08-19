// =============================================================================
// Notifications and Expo push
// =============================================================================
// One place that knows how to reach a person: a row in `notifications` (which
// the app reads over Realtime — see 0005_social.sql) plus a push to every
// registered device.
//
// Push failure never fails the caller. A ticket that exists but whose push did
// not land is recoverable; an order that rolled back because APNs was slow is
// not.

import type { Admin } from "./supabase.ts";
import { DEEP_LINK_SCHEME } from "./env.ts";

const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH = 100;

export interface NotificationInput {
  profileId: string;
  kind: string;
  title: string;
  body?: string | null;
  deepLink?: string | null;
  payload?: Record<string, unknown>;
  /**
   * When set, the notification is inserted only if no notification with the
   * same kind and the same `payload->>dedupe_key` already exists. This is how
   * the Stripe webhook avoids a second "your tickets are ready" on redelivery —
   * `notifications` has no natural unique key to rely on.
   */
  dedupeKey?: string;
  push?: boolean;
}

export interface PushOutcome {
  notified: number;
  pushed: number;
  failed: number;
  removedTokens: number;
  errors: string[];
}

export function deepLink(path: string): string {
  return `${DEEP_LINK_SCHEME()}://${path.replace(/^\/+/, "")}`;
}

/** Inserts the notification row (idempotently when dedupeKey is given). */
export async function insertNotification(
  admin: Admin,
  input: NotificationInput,
): Promise<{ id: string; created: boolean } | null> {
  const payload = { ...(input.payload ?? {}) };
  if (input.dedupeKey) {
    payload.dedupe_key = input.dedupeKey;
    const { data: existing, error } = await admin
      .from("notifications")
      .select("id")
      .eq("profile_id", input.profileId)
      .eq("kind", input.kind)
      .eq("payload->>dedupe_key", input.dedupeKey)
      .limit(1);
    if (error) throw error;
    if (existing && existing.length > 0) {
      return { id: existing[0].id as string, created: false };
    }
  }

  const { data, error } = await admin
    .from("notifications")
    .insert({
      profile_id: input.profileId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      deep_link: input.deepLink ?? null,
      payload,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, created: true };
}

/** Insert + push, for a single recipient. Never throws on push failure. */
export async function notifyUser(admin: Admin, input: NotificationInput): Promise<void> {
  try {
    const result = await insertNotification(admin, input);
    if (input.push === false) return;
    // Do not re-push a notification that was already delivered.
    if (result && !result.created) return;
    await pushToProfiles(admin, [input.profileId], {
      title: input.title,
      body: input.body ?? undefined,
      data: { kind: input.kind, deep_link: input.deepLink ?? null, ...(input.payload ?? {}) },
    });
  } catch (err) {
    console.error("notifyUser failed (non-fatal)", input.kind, input.profileId, err);
  }
}

export interface PushMessage {
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  badge?: number;
  sound?: string | null;
}

/**
 * Sends to every device registered to the given profiles.
 * Tokens Expo reports as DeviceNotRegistered are deleted, which is the only
 * way `push_tokens` stays clean — nothing else prunes it.
 */
export async function pushToProfiles(
  admin: Admin,
  profileIds: string[],
  message: PushMessage,
): Promise<PushOutcome> {
  const outcome: PushOutcome = { notified: profileIds.length, pushed: 0, failed: 0, removedTokens: 0, errors: [] };
  if (profileIds.length === 0) return outcome;

  const { data: tokens, error } = await admin
    .from("push_tokens")
    .select("id, token, profile_id, platform")
    .in("profile_id", profileIds);
  if (error) throw error;
  if (!tokens || tokens.length === 0) return outcome;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
  };
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const staleTokenIds: string[] = [];

  for (let i = 0; i < tokens.length; i += EXPO_BATCH) {
    const batch = tokens.slice(i, i + EXPO_BATCH);
    const messages = batch.map((t) => ({
      to: t.token,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
      sound: message.sound === null ? undefined : (message.sound ?? "default"),
      badge: message.badge,
      channelId: "default",
    }));

    let json: { data?: Array<{ status: string; message?: string; details?: { error?: string } }>; errors?: unknown };
    try {
      const res = await fetch(EXPO_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        outcome.failed += batch.length;
        outcome.errors.push(`Expo returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        continue;
      }
      json = await res.json();
    } catch (err) {
      outcome.failed += batch.length;
      outcome.errors.push(`Expo request failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const tickets = json.data ?? [];
    tickets.forEach((ticket, idx) => {
      if (ticket.status === "ok") {
        outcome.pushed++;
        return;
      }
      outcome.failed++;
      const reason = ticket.details?.error ?? ticket.message ?? "unknown";
      outcome.errors.push(`${batch[idx].platform} token rejected: ${reason}`);
      if (ticket.details?.error === "DeviceNotRegistered") {
        staleTokenIds.push(batch[idx].id as string);
      }
    });
  }

  if (staleTokenIds.length > 0) {
    const { error: delError } = await admin.from("push_tokens").delete().in("id", staleTokenIds);
    if (delError) {
      outcome.errors.push(`Failed to prune ${staleTokenIds.length} dead tokens: ${delError.message}`);
    } else {
      outcome.removedTokens = staleTokenIds.length;
    }
  }

  return outcome;
}
