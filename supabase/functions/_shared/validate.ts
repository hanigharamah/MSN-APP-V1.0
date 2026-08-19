// =============================================================================
// Input validation
// =============================================================================
// Small, dependency-free assertions. Each throws an ApiError whose `fix` names
// the offending field, because a 400 that does not name the field is a support
// ticket waiting to happen.

import { badRequest } from "./errors.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireString(v: unknown, field: string, opts: { max?: number; min?: number } = {}): string {
  if (typeof v !== "string" || v.trim() === "") {
    throw badRequest("missing_field", `\`${field}\` is required and must be a non-empty string.`, `Send \`${field}\` in the request body.`);
  }
  const s = v.trim();
  if (opts.min !== undefined && s.length < opts.min) {
    throw badRequest("field_too_short", `\`${field}\` must be at least ${opts.min} characters.`, `Ask the user for more detail in \`${field}\`.`);
  }
  if (opts.max !== undefined && s.length > opts.max) {
    throw badRequest("field_too_long", `\`${field}\` must be at most ${opts.max} characters (received ${s.length}).`, `Truncate \`${field}\` before sending.`);
  }
  return s;
}

export function requireUuid(v: unknown, field: string): string {
  const s = requireString(v, field);
  if (!UUID_RE.test(s)) {
    throw badRequest("invalid_uuid", `\`${field}\` must be a UUID, received "${s}".`, `Send the row's \`id\` value, not its slug or reference.`);
  }
  return s;
}

export function optionalUuid(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  return requireUuid(v, field);
}

export function optionalString(v: unknown, field: string, max = 2000): string | null {
  if (v === undefined || v === null || v === "") return null;
  return requireString(v, field, { max });
}

export function requireInt(
  v: unknown,
  field: string,
  opts: { min?: number; max?: number } = {},
): number {
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw badRequest("invalid_integer", `\`${field}\` must be a whole number, received ${JSON.stringify(v)}.`, `Send \`${field}\` as a JSON number with no decimal part.`);
  }
  if (opts.min !== undefined && v < opts.min) {
    throw badRequest("out_of_range", `\`${field}\` must be at least ${opts.min}, received ${v}.`, `Clamp \`${field}\` to ${opts.min} or more before sending.`);
  }
  if (opts.max !== undefined && v > opts.max) {
    throw badRequest("out_of_range", `\`${field}\` must be at most ${opts.max}, received ${v}.`, `Clamp \`${field}\` to ${opts.max} or less before sending.`);
  }
  return v;
}

export function requireEnum<T extends string>(v: unknown, field: string, allowed: readonly T[]): T {
  const s = requireString(v, field);
  if (!(allowed as readonly string[]).includes(s)) {
    throw badRequest("invalid_enum", `\`${field}\` must be one of ${allowed.map((a) => `"${a}"`).join(", ")}, received "${s}".`, `Send one of the listed values.`);
  }
  return s as T;
}

export function optionalEnum<T extends string>(v: unknown, field: string, allowed: readonly T[], fallback: T): T {
  if (v === undefined || v === null || v === "") return fallback;
  return requireEnum(v, field, allowed);
}

export function requireBoolean(v: unknown, field: string, fallback?: boolean): boolean {
  if (v === undefined || v === null) {
    if (fallback !== undefined) return fallback;
    throw badRequest("missing_field", `\`${field}\` is required.`, `Send \`${field}\` as true or false.`);
  }
  if (typeof v !== "boolean") {
    throw badRequest("invalid_boolean", `\`${field}\` must be true or false, received ${JSON.stringify(v)}.`, `Send a JSON boolean, not a string.`);
  }
  return v;
}

/** Parses an ISO-8601 instant. Rejects anything Date cannot understand. */
export function requireInstant(v: unknown, field: string): Date {
  const s = requireString(v, field);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw badRequest("invalid_timestamp", `\`${field}\` is not a valid ISO-8601 timestamp, received "${s}".`, `Send a UTC instant such as "2026-09-01T14:30:00Z".`);
  }
  return d;
}

export function requireArray<T>(v: unknown, field: string, opts: { min?: number; max?: number } = {}): T[] {
  if (!Array.isArray(v)) {
    throw badRequest("invalid_array", `\`${field}\` must be an array.`, `Send \`${field}\` as a JSON array.`);
  }
  if (opts.min !== undefined && v.length < opts.min) {
    throw badRequest("array_too_short", `\`${field}\` must contain at least ${opts.min} item(s).`, `Add at least ${opts.min} entry to \`${field}\`.`);
  }
  if (opts.max !== undefined && v.length > opts.max) {
    throw badRequest("array_too_long", `\`${field}\` must contain at most ${opts.max} items (received ${v.length}).`, `Split the request or reduce \`${field}\`.`);
  }
  return v as T[];
}
