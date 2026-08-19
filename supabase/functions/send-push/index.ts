// =============================================================================
// send-push
// =============================================================================
// Fan-out: writes a row into `notifications` for each recipient and pushes to
// every device in `push_tokens` via the Expo Push API.
//
// The notification row is the durable record — the app reads it over Realtime
// (0005_social.sql publishes the table) and it is what the bell icon renders.
// The push is a best-effort nudge on top. If Expo is down, the notification
// still exists and the user still sees it when they open the app; the response
// reports the push failures rather than swallowing them.
//
// ## Who may call this
//
//   * a signed-in platform admin, or
//   * a caller presenting the service-role key (other Edge Functions, cron
//     jobs, the back office).
//
// Not ordinary users. An open push endpoint is a spam cannon.
//
// POST body:
//   {
//     "profile_ids": ["uuid", ...],       // or "profile_id": "uuid"
//     "audience":    "followers_of:<uuid>" | "event_attendees:<uuid>",  // optional
//     "kind":        "event_reminder",
//     "title":       "Starts in an hour",
//     "body":        "...",
//     "deep_link":   "msn://event/<id>",  // optional; `path` is also accepted
//     "payload":     { ... },             // optional, merged into the push data
//     "dedupe_key":  "event_reminder:<id>",  // optional, makes the call idempotent
//     "push":        true                 // set false to record without pushing
//   }

import { forbidden, json, readJson, serveJson, unprocessable } from "../_shared/errors.ts";
import { adminClient, isServiceRoleCaller, requireUser } from "../_shared/supabase.ts";
import { optionalString, requireArray, requireBoolean, requireString, requireUuid } from "../_shared/validate.ts";
import { deepLink, insertNotification, pushToProfiles } from "../_shared/notify.ts";

const MAX_RECIPIENTS = 2000;

Deno.serve(serveJson(async (req) => {
  const admin = adminClient();

  // ------------------------------------------------------------- authorise
  let actorId = "service_role";
  if (!isServiceRoleCaller(req)) {
    const caller = await requireUser(req);
    if (!caller.profile.is_admin) {
      throw forbidden(
        "send-push is restricted to platform administrators and server-side callers.",
        "Do not call this from the seeker or provider app. Trigger notifications from the Edge Function that owns the event (checkout, webhook, booking), or from the admin console.",
      );
    }
    actorId = caller.userId;
  }

  const body = await readJson(req);

  const kind = requireString(body.kind, "kind", { max: 64 });
  const title = requireString(body.title, "title", { max: 180 });
  const message = optionalString(body.body, "body", 1000);
  const dedupeKey = optionalString(body.dedupe_key, "dedupe_key", 200) ?? undefined;
  const shouldPush = requireBoolean(body.push, "push", true);
  const payload = (body.payload && typeof body.payload === "object" && !Array.isArray(body.payload))
    ? body.payload as Record<string, unknown>
    : {};

  const link = body.deep_link
    ? requireString(body.deep_link, "deep_link", { max: 500 })
    : body.path
    ? deepLink(requireString(body.path, "path", { max: 400 }))
    : null;

  // ------------------------------------------------------------ recipients
  let profileIds: string[] = [];

  if (body.profile_ids !== undefined) {
    profileIds = requireArray<unknown>(body.profile_ids, "profile_ids", { min: 1, max: MAX_RECIPIENTS })
      .map((v, i) => requireUuid(v, `profile_ids[${i}]`));
  } else if (body.profile_id !== undefined) {
    profileIds = [requireUuid(body.profile_id, "profile_id")];
  } else if (body.audience !== undefined) {
    profileIds = await resolveAudience(admin, requireString(body.audience, "audience", { max: 120 }));
  } else {
    throw unprocessable(
      "no_recipients",
      "The request named nobody to notify.",
      'Send `profile_id`, `profile_ids`, or `audience` (e.g. "event_attendees:<event-id>").',
    );
  }

  profileIds = [...new Set(profileIds)];
  if (profileIds.length === 0) {
    return json({ notified: 0, created: 0, skipped: 0, pushed: 0, failed: 0, note: "The audience resolved to nobody." });
  }
  if (profileIds.length > MAX_RECIPIENTS) {
    throw unprocessable(
      "audience_too_large",
      `${profileIds.length} recipients exceeds the ${MAX_RECIPIENTS} limit for one call.`,
      `Page the audience and call this function once per batch of ${MAX_RECIPIENTS}.`,
    );
  }

  // Drop suspended accounts — they should not be pulled back into the app.
  const { data: active, error: activeError } = await admin
    .from("profiles")
    .select("id")
    .in("id", profileIds)
    .eq("is_suspended", false);
  if (activeError) throw activeError;
  const deliverTo = (active ?? []).map((p) => p.id as string);
  const suppressed = profileIds.length - deliverTo.length;

  // ------------------------------------------------------ notification rows
  let created = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const profileId of deliverTo) {
    try {
      const result = await insertNotification(admin, {
        profileId,
        kind,
        title,
        body: message,
        deepLink: link,
        payload: { ...payload, sent_by: actorId },
        dedupeKey,
      });
      if (result?.created) created++;
      else skipped++;
    } catch (err) {
      failures.push(`${profileId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ------------------------------------------------------------------ push
  let push = { pushed: 0, failed: 0, removedTokens: 0, errors: [] as string[] };
  if (shouldPush && deliverTo.length > 0) {
    // Only push to people who got a *new* notification, unless nothing was
    // deduped — otherwise a re-run buzzes everyone's phone again.
    const targets = dedupeKey && skipped > 0 && created === 0 ? [] : deliverTo;
    if (targets.length > 0) {
      const outcome = await pushToProfiles(admin, targets, {
        title,
        body: message ?? undefined,
        data: { kind, deep_link: link, ...payload },
      });
      push = {
        pushed: outcome.pushed,
        failed: outcome.failed,
        removedTokens: outcome.removedTokens,
        errors: outcome.errors,
      };
    }
  }

  return json({
    kind,
    requested: profileIds.length,
    notified: deliverTo.length,
    created,
    skipped_duplicates: skipped,
    suppressed_suspended: suppressed,
    pushed: push.pushed,
    push_failed: push.failed,
    stale_tokens_removed: push.removedTokens,
    // Surfaced, never thrown: a failed push must not fail the caller.
    errors: [...failures, ...push.errors].slice(0, 25),
  });
}));

/**
 * Convenience audiences so callers do not have to reimplement these queries.
 * Everything else should pass explicit ids.
 */
async function resolveAudience(admin: ReturnType<typeof adminClient>, audience: string): Promise<string[]> {
  const [selector, arg] = audience.split(":");

  if (selector === "followers_of") {
    const id = requireUuid(arg, "audience target");
    const { data, error } = await admin.from("follows").select("follower_id").eq("followed_id", id);
    if (error) throw error;
    return (data ?? []).map((r) => r.follower_id as string);
  }

  if (selector === "event_attendees") {
    const id = requireUuid(arg, "audience target");
    const { data, error } = await admin
      .from("tickets")
      .select("holder_id")
      .eq("event_id", id)
      .eq("is_void", false)
      .not("holder_id", "is", null);
    if (error) throw error;
    return (data ?? []).map((r) => r.holder_id as string);
  }

  throw unprocessable(
    "unknown_audience",
    `"${audience}" is not an audience this function knows how to resolve.`,
    'Use "followers_of:<profile-id>" or "event_attendees:<event-id>", or send `profile_ids` directly.',
  );
}
