import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

import { deviceTimeZone } from '@/lib/format';

/**
 * Wall-clock entry in a named time zone.
 *
 * `lib/format` covers the read direction — a UTC instant rendered in an
 * offering's zone. A host tool needs the write direction as well, and there is
 * nothing in `lib/format` for it: turning "1 September, 9:00am in Bali" back
 * into the UTC instant the column stores.
 *
 * TODO(agent · events): this belongs beside its mirror in `src/lib/format.ts`
 * once that file is open for edits. It lives here because this pass does not
 * own `src/lib/`, and a screen parsing dates inline would be worse.
 *
 * ## Why the parsing is this strict
 *
 * MSN-DEV-2247 was a malformed-date defect on the ticket sales window. Every
 * accessor here refuses anything it cannot round-trip, and refuses it as
 * `null` rather than as an `Invalid Date` that survives one more layer and
 * lands in the database as `NaN`. In particular `new Date('2026-02-31')` and
 * `new TZDate(2026, 1, 31, ...)` both silently roll over into March; the
 * calendar check below rejects that date instead.
 *
 * The stored value is always UTC. The edited value is always the event's own
 * zone. Those are the only two representations that exist — no third one in
 * the device's zone, which is the shape of the classic marketplace bug.
 */

/** A date and a time as the host typed them, in the event's zone. */
export interface DateTimeParts {
  /** `YYYY-MM-DD`. */
  date: string;
  /** 24-hour `HH:mm`. */
  time: string;
}

export const EMPTY_PARTS: DateTimeParts = { date: '', time: '' };

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/** True when both halves are blank — "this optional timestamp is not set". */
export function isPartsEmpty(parts: DateTimeParts): boolean {
  return parts.date.trim().length === 0 && parts.time.trim().length === 0;
}

/** True when exactly one half was filled in. Always an error, never a value. */
export function isPartsPartial(parts: DateTimeParts): boolean {
  const hasDate = parts.date.trim().length > 0;
  const hasTime = parts.time.trim().length > 0;
  return hasDate !== hasTime;
}

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one. UTC throughout, so
  // the device zone cannot shift the answer across a boundary.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** `null` when valid. The message is written for the field, not the console. */
export function validateDate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Enter a date.';

  const match = DATE_PATTERN.exec(trimmed);
  if (!match) return 'Use YYYY-MM-DD, like 2026-09-01.';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return 'Months run from 01 to 12.';
  if (day < 1) return 'Days start at 01.';

  const limit = daysInMonth(year, month);
  if (day > limit) {
    return `${MONTH_NAMES[month - 1] ?? 'That month'} ${year} has ${limit} days.`;
  }
  return null;
}

/** `null` when valid. 24-hour clock — an am/pm field is a separate control. */
export function validateTime(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Enter a time.';

  const match = TIME_PATTERN.exec(trimmed);
  if (!match) return 'Use the 24-hour clock, like 18:30.';

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23) return 'Hours run from 00 to 23.';
  if (minutes > 59) return 'Minutes run from 00 to 59.';
  return null;
}

/**
 * Whether the engine knows this IANA zone.
 *
 * Hermes ships a trimmed ICU on some Android builds, so this can legitimately
 * answer false for a zone that exists — which is the right answer anyway,
 * because a zone the engine cannot resolve is one it cannot format either.
 */
export function isValidTimeZone(timeZone: string): boolean {
  const trimmed = timeZone.trim();
  if (trimmed.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** The stored UTC instant, split into the fields the host edits. */
export function partsFromIso(iso: string, timeZone: string): DateTimeParts {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return EMPTY_PARTS;

  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const zoned = new TZDate(instant, zone);
  return { date: format(zoned, 'yyyy-MM-dd'), time: format(zoned, 'HH:mm') };
}

/**
 * The UTC instant for a wall-clock time in `timeZone`, or `null` when the
 * input is not a real date, not a real time, or the zone is unknown.
 *
 * Null is the only failure mode on purpose: callers cannot accidentally send
 * an `Invalid Date` to PostgREST, which reports it as a generic 400 with no
 * field attached.
 */
export function partsToUtcIso(parts: DateTimeParts, timeZone: string): string | null {
  if (validateDate(parts.date) !== null) return null;
  if (validateTime(parts.time) !== null) return null;
  if (!isValidTimeZone(timeZone)) return null;

  const date = DATE_PATTERN.exec(parts.date.trim());
  const time = TIME_PATTERN.exec(parts.time.trim());
  if (!date || !time) return null;

  try {
    const zoned = new TZDate(
      Number(date[1]),
      Number(date[2]) - 1,
      Number(date[3]),
      Number(time[1]),
      Number(time[2]),
      timeZone.trim(),
    );
    const ms = zoned.getTime();
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

/**
 * Set when the entered wall-clock time does not exist in that zone — the hour
 * a spring-forward transition skips. The instant we store is real, but it is
 * not the one that was typed, so the host is told rather than surprised later.
 *
 * Returns null when the time is fine, unparseable (a field error already
 * covers it), or falls in an ambiguous repeated hour, where both readings are
 * real times and picking one is not an error.
 */
export function dstShiftNote(parts: DateTimeParts, timeZone: string): string | null {
  const iso = partsToUtcIso(parts, timeZone);
  if (iso === null) return null;

  const roundTrip = partsFromIso(iso, timeZone);
  if (roundTrip.date === parts.date.trim() && roundTrip.time === normaliseTime(parts.time)) {
    return null;
  }
  return `That time does not exist in ${timeZone.trim()} — the clocks move forward. It will be saved as ${roundTrip.time} on ${roundTrip.date}.`;
}

/** `9:05` -> `09:05`, so a round-trip comparison is not fooled by padding. */
function normaliseTime(value: string): string {
  const match = TIME_PATTERN.exec(value.trim());
  if (!match) return value.trim();
  return `${match[1]?.padStart(2, '0') ?? '00'}:${match[2] ?? '00'}`;
}

/** Now, as editable fields in `timeZone`. */
export function nowParts(timeZone: string): DateTimeParts {
  return partsFromIso(new Date().toISOString(), timeZone);
}

/**
 * A sensible starting point for a new event: tomorrow at 10:00 in the host's
 * own zone, running two hours. Prefilled rather than blank because an empty
 * date field is the one people mistype.
 */
export function defaultEventWindow(timeZone: string = deviceTimeZone()): {
  timezone: string;
  starts: DateTimeParts;
  ends: DateTimeParts;
} {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const tomorrow = partsFromIso(new Date(Date.now() + 86_400_000).toISOString(), zone);
  return {
    timezone: zone,
    starts: { date: tomorrow.date, time: '10:00' },
    ends: { date: tomorrow.date, time: '12:00' },
  };
}

/**
 * Zones offered as one-tap suggestions. Deliberately short: the field accepts
 * any IANA name, and `Intl.supportedValuesOf('timeZone')` is not available on
 * every Hermes build, so a 400-row picker cannot be built reliably.
 */
export const SUGGESTED_TIME_ZONES: readonly string[] = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];
