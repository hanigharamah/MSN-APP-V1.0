// =============================================================================
// CORS
// =============================================================================
// The React Native app does not need CORS, but the web build and the Supabase
// dashboard's function tester do. Kept in one place so every function agrees.

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/** Returns a 204 preflight response, or null if this is not a preflight. */
export function preflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders });
}
