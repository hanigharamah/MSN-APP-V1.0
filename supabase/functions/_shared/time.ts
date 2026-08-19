// =============================================================================
// Time zones
// =============================================================================
// `availability_rules` stores a weekday plus a local wall-clock window plus its
// own IANA timezone. A booking arrives as a UTC instant. Turning one into the
// other is the only genuinely fiddly bit of book-service, so it lives here on
// its own where it can be reasoned about.
//
// Deno ships full ICU, so Intl.DateTimeFormat with a timeZone is enough — no
// date library, no offset table.

import { badRequest } from "./errors.ts";

export interface ZonedParts {
  /** 0 = Sunday, matching `availability_rules.weekday`. */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const hit = formatterCache.get(timeZone);
  if (hit) return hit;
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw badRequest(
      "unknown_timezone",
      `"${timeZone}" is not an IANA timezone this runtime recognises.`,
      'Use a canonical zone id such as "America/New_York" or "Europe/London". Check the timezone column on the availability rule or profile that produced it.',
    );
  }
  formatterCache.set(timeZone, fmt);
  return fmt;
}

/** Projects a UTC instant into a named timezone's wall clock. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = WEEKDAYS[get("weekday")];
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return {
    weekday,
    minutes: hour * 60 + minute,
    date: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** "09:30:00" or "09:30" -> 570. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

export function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

/** Half-open overlap: [aStart, aEnd) intersects [bStart, bEnd). */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 3_600_000;
}
