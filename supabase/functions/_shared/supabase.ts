// =============================================================================
// Supabase clients and caller identity
// =============================================================================
// Two clients, deliberately distinct:
//
//   adminClient()  — service role. Bypasses RLS. Used for every write these
//                    functions make, because 0006_rls.sql intentionally gives
//                    the client no UPDATE path into orders, tickets, or
//                    refund_requests.
//
//   requireUser()  — resolves the *caller* from their own JWT so we know whose
//                    order this is. The service-role client is never used to
//                    decide identity, only to act on it.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { ApiError, forbidden, unauthorized } from "./errors.ts";
import { requireEnv } from "./env.ts";

export type Admin = SupabaseClient;

let cached: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (cached) return cached;
  const url = requireEnv("SUPABASE_URL", "every database call needs the project URL.");
  const key = requireEnv(
    "SUPABASE_SERVICE_ROLE_KEY",
    "these functions write to tables that RLS deliberately closes to clients.",
  );
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "msn-edge-functions" } },
  });
  return cached;
}

export interface Profile {
  id: string;
  account_type: string;
  display_name: string;
  email: string | null;
  timezone: string;
  is_admin: boolean;
  is_suspended: boolean;
}

export interface Caller {
  userId: string;
  profile: Profile;
}

export function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw unauthorized();
  return match[1].trim();
}

/** Resolves the signed-in caller. Throws 401/403 rather than returning null. */
export async function requireUser(req: Request): Promise<Caller> {
  const token = bearerToken(req);
  const admin = adminClient();

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    throw unauthorized(
      "The access token was rejected by Supabase Auth.",
      "Refresh the session on the client (`supabase.auth.refreshSession()`) and retry. If it still fails, sign the user in again.",
    );
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, account_type, display_name, email, timezone, is_admin, is_suspended")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) {
    throw new ApiError(
      404,
      "profile_missing",
      "The signed-in user has no row in `profiles`.",
      "This should be impossible — 0002_identity.sql creates it on signup. Check whether the `on_auth_user_created` trigger exists in this project.",
    );
  }
  if (profile.is_suspended) {
    throw forbidden(
      "This account is suspended.",
      "Contact support. Suspended accounts cannot transact.",
    );
  }

  return { userId: profile.id, profile: profile as Profile };
}

export async function requireAdmin(req: Request): Promise<Caller> {
  const caller = await requireUser(req);
  if (!caller.profile.is_admin) {
    throw forbidden(
      "This function is restricted to platform administrators.",
      "Do not expose this endpoint in the seeker or provider app. Call it from the admin console with an admin session.",
    );
  }
  return caller;
}

/**
 * True when the request presents the service-role key directly. Used by
 * send-push so other Edge Functions and back-office jobs can fan out without
 * impersonating a human admin.
 */
export function isServiceRoleCaller(req: Request): boolean {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!expected) return false;
  const header = req.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return timingSafeEqual(match[1].trim(), expected.trim());
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
