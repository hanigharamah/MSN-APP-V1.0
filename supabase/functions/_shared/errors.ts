// =============================================================================
// Errors and responses
// =============================================================================
// Every error the client can see carries three things:
//   code    — stable machine-readable string, safe to switch on
//   message — what went wrong
//   fix     — what the caller should do about it
// The third one is the point. "Invalid request" tells a mobile developer
// nothing at 2am; "sales for this ticket type closed on 2026-08-01T18:00Z —
// show the closed state instead of the buy button" tells them everything.

import { corsHeaders } from "./cors.ts";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fix?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (code: string, message: string, fix?: string, details?: unknown) =>
  new ApiError(400, code, message, fix, details);

export const unauthorized = (message = "Missing or invalid access token.", fix =
  "Send the signed-in user's Supabase access token as `Authorization: Bearer <token>`.") =>
  new ApiError(401, "unauthorized", message, fix);

export const forbidden = (message: string, fix?: string) =>
  new ApiError(403, "forbidden", message, fix);

export const notFound = (code: string, message: string, fix?: string) =>
  new ApiError(404, code, message, fix);

export const conflict = (code: string, message: string, fix?: string, details?: unknown) =>
  new ApiError(409, code, message, fix, details);

export const unprocessable = (code: string, message: string, fix?: string, details?: unknown) =>
  new ApiError(422, code, message, fix, details);

export function json(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return json(
      { error: { code: err.code, message: err.message, fix: err.fix, details: err.details } },
      err.status,
    );
  }
  // Never leak an internal stack to the client, but do log it.
  console.error("unhandled error", err);
  const message = err instanceof Error ? err.message : String(err);
  return json(
    {
      error: {
        code: "internal_error",
        message: "The function failed unexpectedly.",
        fix: "Retry once. If it keeps failing, check the function logs for the request id.",
        details: Deno.env.get("DEBUG_ERRORS") === "true" ? message : undefined,
      },
    },
    500,
  );
}

/** Wraps a handler: CORS preflight, POST-only, JSON errors. */
export function serveJson(
  handler: (req: Request) => Promise<Response>,
  opts: { methods?: string[] } = {},
): (req: Request) => Promise<Response> {
  const methods = opts.methods ?? ["POST"];
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (!methods.includes(req.method)) {
      return errorResponse(
        new ApiError(
          405,
          "method_not_allowed",
          `${req.method} is not supported by this function.`,
          `Use ${methods.join(" or ")}.`,
        ),
      );
    }
    try {
      return await handler(req);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Parses a JSON body, with a useful message when it is not JSON. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  const raw = await req.text();
  if (!raw.trim()) {
    throw badRequest(
      "empty_body",
      "The request body was empty.",
      "Send a JSON object. See the function README for the expected shape.",
    );
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw badRequest(
      "invalid_json",
      "The request body was not valid JSON.",
      "Set `Content-Type: application/json` and send a JSON-encoded object.",
    );
  }
}
