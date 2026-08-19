import { TZDate } from '@date-fns/tz';
import { addDays, format } from 'date-fns';

import type { AvailabilityRule } from '@/types/database';
import { isValidTimeZone } from './time-zones';

/**
 * Pure model for the availability screen. No React, no Supabase.
 *
 * ## What a rule actually is
 *
 * `availability_rules` is a **weekly wall-clock window in one named zone**:
 * weekday (0 = Sunday, matching `extract(dow)`), `starts_time`, `ends_time`,
 * `timezone`. `available_slots` expands it as
 * `(day + starts_time) at time zone rule.timezone`, per rule, in *that rule's*
 * zone — which is why two rules on the same screen can legitimately carry two
 * different zones, and why every window here is rendered with its zone attached.
 *
 * ## What a rule is not
 *
 * It is not a slot list and it does not control spacing. Candidate starts are
 * cut every `duration_minutes + buffer_minutes` from the **service**, and the
 * same `buffer_minutes` widens existing bookings on both sides when the function
 * subtracts them. Nothing on this screen changes either.
 */

export interface WeekdayOption {
  /** 0 = Sunday. Matches `availability_rules.weekday` and `extract(dow)`. */
  value: number;
  long: string;
  short: string;
}

export const WEEKDAYS: readonly WeekdayOption[] = [
  { value: 0, long: 'Sunday', short: 'Sun' },
  { value: 1, long: 'Monday', short: 'Mon' },
  { value: 2, long: 'Tuesday', short: 'Tue' },
  { value: 3, long: 'Wednesday', short: 'Wed' },
  { value: 4, long: 'Thursday', short: 'Thu' },
  { value: 5, long: 'Friday', short: 'Fri' },
  { value: 6, long: 'Saturday', short: 'Sat' },
];

export function weekdayLong(weekday: number): string {
  return WEEKDAYS.find((day) => day.value === weekday)?.long ?? 'Unknown day';
}

// -----------------------------------------------------------------------------
// Times
// -----------------------------------------------------------------------------

/**
 * Minutes past local midnight for an end time meaning "midnight, end of day".
 *
 * Postgres accepts `time '24:00:00'` and `date + time '24:00:00'` rolls into the
 * next day, so a window running to midnight is expressible and satisfies
 * `ends_time > starts_time`. Verified against the live schema.
 */
export const END_OF_DAY_MINUTES = 24 * 60;

/** `'9:0'`, `'09:00'`, `'09:00:00'` -> `'09:00:00'`. */
export function normaliseTime(value: string): string {
  const parts = value.split(':');
  const hours = Number.parseInt(parts[0] ?? '0', 10);
  const minutes = Number.parseInt(parts[1] ?? '0', 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '00:00:00';
  return minutesToTime(hours * 60 + minutes);
}

/** Minutes past midnight. `'24:00:00'` -> 1440. */
export function timeToMinutes(value: string): number {
  const parts = value.split(':');
  const hours = Number.parseInt(parts[0] ?? '0', 10);
  const minutes = Number.parseInt(parts[1] ?? '0', 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(END_OF_DAY_MINUTES, Math.round(minutes)));
  const hours = Math.floor(clamped / 60);
  const rest = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}:00`;
}

/**
 * `'09:00:00'` -> `'9:00 AM'`.
 *
 * Deliberately local to this folder rather than added to `lib/format`. Every
 * helper there takes an *instant* and a zone; a `time` column is neither — it is
 * a wall-clock reading with no date and therefore no offset, and running it
 * through `formatEventClock` would mean inventing a date to anchor it to.
 */
export function formatClock(value: string): string {
  const minutes = timeToMinutes(value);
  if (minutes >= END_OF_DAY_MINUTES) return 'Midnight';

  const hours24 = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const suffix = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(rest).padStart(2, '0')} ${suffix}`;
}

/** `'9:00 AM – 5:00 PM'`. */
export function formatWindow(startsTime: string, endsTime: string): string {
  return `${formatClock(startsTime)} – ${formatClock(endsTime)}`;
}

/** `'8h'`, `'1h 30m'`, `'45m'` — how long a window is open. */
export function formatWindowLength(startsTime: string, endsTime: string): string {
  const span = timeToMinutes(endsTime) - timeToMinutes(startsTime);
  if (span <= 0) return '0m';
  const hours = Math.floor(span / 60);
  const rest = span % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * The times a picker offers, every `step` minutes.
 *
 * `extra` is folded in so a rule already saved at an off-grid time (09:07, say,
 * written by another client) still has its own value selectable instead of being
 * silently rounded the first time someone opens the picker.
 */
export function timeOptions(options: {
  step?: number;
  includeEndOfDay?: boolean;
  extra?: readonly string[];
}): string[] {
  const step = options.step ?? 15;
  const values = new Set<string>();

  for (let minutes = 0; minutes < END_OF_DAY_MINUTES; minutes += step) {
    values.add(minutesToTime(minutes));
  }
  if (options.includeEndOfDay) values.add(minutesToTime(END_OF_DAY_MINUTES));
  for (const value of options.extra ?? []) values.add(normaliseTime(value));

  return [...values].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
}

// -----------------------------------------------------------------------------
// The draft
// -----------------------------------------------------------------------------

/**
 * One window being edited.
 *
 * `key` is client-only. `replaceAvailabilityRules` deletes every row and inserts
 * fresh ones, so server ids do not survive a save and carrying them would imply
 * a stability the write does not have.
 */
export interface DraftRule {
  key: string;
  weekday: number;
  starts_time: string;
  ends_time: string;
  timezone: string;
}

let keyCounter = 0;

export function newRuleKey(): string {
  keyCounter += 1;
  return `rule-${Date.now().toString(36)}-${keyCounter}`;
}

export function draftFromRules(rules: readonly AvailabilityRule[]): DraftRule[] {
  return rules.map((rule) => ({
    key: rule.id,
    weekday: rule.weekday,
    starts_time: normaliseTime(rule.starts_time),
    ends_time: normaliseTime(rule.ends_time),
    timezone: rule.timezone,
  }));
}

export type RulePayload = Omit<AvailabilityRule, 'id' | 'provider_id'>;

export function rulesPayload(draft: readonly DraftRule[]): RulePayload[] {
  return draft.map((rule) => ({
    weekday: rule.weekday,
    starts_time: rule.starts_time,
    ends_time: rule.ends_time,
    timezone: rule.timezone,
  }));
}

/** Order-independent fingerprint, for "are there unsaved changes". */
export function signatureOf(draft: readonly DraftRule[]): string {
  return draft
    .map((rule) => `${rule.weekday}|${rule.starts_time}|${rule.ends_time}|${rule.timezone}`)
    .sort()
    .join('\n');
}

/** Sorted for display: by weekday, then by clock, then by zone. */
export function sortDraft(draft: readonly DraftRule[]): DraftRule[] {
  return [...draft].sort(
    (a, b) =>
      a.weekday - b.weekday ||
      timeToMinutes(a.starts_time) - timeToMinutes(b.starts_time) ||
      a.timezone.localeCompare(b.timezone),
  );
}

export function rulesForWeekday(draft: readonly DraftRule[], weekday: number): DraftRule[] {
  return sortDraft(draft.filter((rule) => rule.weekday === weekday));
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

/**
 * Why a single window cannot be saved, or `null`.
 *
 * These mirror the two things the database itself refuses: the
 * `availability_end_after_start` check constraint, and a `timezone` string the
 * runtime cannot resolve. Catching them here matters more than usual, because
 * `replaceAvailabilityRules` has already deleted the old rows by the time the
 * insert is rejected.
 */
export function problemWith(rule: DraftRule): string | null {
  if (timeToMinutes(rule.ends_time) <= timeToMinutes(rule.starts_time)) {
    return 'The end time has to be after the start time.';
  }
  if (!isValidTimeZone(rule.timezone)) {
    return `“${rule.timezone}” is not a time zone this device recognises.`;
  }
  return null;
}

export function problemsFor(draft: readonly DraftRule[]): Map<string, string> {
  const problems = new Map<string, string>();
  for (const rule of draft) {
    const problem = problemWith(rule);
    if (problem !== null) problems.set(rule.key, problem);
  }
  return problems;
}

/**
 * Same-zone windows on the same weekday that overlap.
 *
 * Not an error — the database allows it and `available_slots` de-duplicates
 * identical starts. It is still worth saying, because two overlapping windows
 * that are *not* aligned to the same grid generate extra, staggered start times
 * that look arbitrary in the preview.
 *
 * Only compared within a zone: "Monday 9–5 London" and "Monday 9–5 New York" are
 * different real windows, not a mistake.
 */
export function overlapWarnings(draft: readonly DraftRule[]): string[] {
  const warnings: string[] = [];
  const sorted = sortDraft(draft);

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (current === undefined) continue;

    for (let other = index + 1; other < sorted.length; other += 1) {
      const next = sorted[other];
      if (next === undefined) continue;
      if (next.weekday !== current.weekday) break;
      if (next.timezone !== current.timezone) continue;
      if (timeToMinutes(next.starts_time) < timeToMinutes(current.ends_time)) {
        warnings.push(
          `${weekdayLong(current.weekday)}: ${formatWindow(current.starts_time, current.ends_time)} overlaps ${formatWindow(next.starts_time, next.ends_time)} in ${next.timezone}.`,
        );
      }
    }
  }
  return warnings;
}

// -----------------------------------------------------------------------------
// Wall clock -> instant
// -----------------------------------------------------------------------------

export interface RuleOccurrence {
  /** UTC instant the window opens. */
  startsAt: Date;
  /** UTC instant it closes. */
  endsAt: Date;
}

/**
 * The next real occurrence of a weekly window, as UTC instants.
 *
 * This is what makes the zone legible: a rule reading "Tuesday 9:00–17:00
 * Europe/London" can be shown as the actual times it lands on in the viewer's
 * own zone, including the day shift when the two are far apart.
 *
 * Built from wall-clock components rather than by adding minutes to midnight, so
 * it agrees with `(day + starts_time) at time zone tz` across a daylight-saving
 * boundary — the day a clock jumps, midnight + 9h and 09:00 are not the same
 * instant, and Postgres means the second one.
 *
 * Returns `null` for an unresolvable zone rather than an `Invalid Date`.
 */
export function nextOccurrence(
  rule: Pick<DraftRule, 'weekday' | 'starts_time' | 'ends_time' | 'timezone'>,
  from: Date = new Date(),
): RuleOccurrence | null {
  if (!isValidTimeZone(rule.timezone)) return null;

  const localNow = new TZDate(from, rule.timezone);
  const delta = (rule.weekday - localNow.getDay() + 7) % 7;

  const build = (dayOffset: number): RuleOccurrence => {
    const day = addDays(localNow, dayOffset);
    return {
      startsAt: wallClockInstant(rule.timezone, day, timeToMinutes(rule.starts_time)),
      endsAt: wallClockInstant(rule.timezone, day, timeToMinutes(rule.ends_time)),
    };
  };

  const soonest = build(delta);
  if (soonest.startsAt.getTime() > from.getTime()) return soonest;
  return build(delta + 7);
}

// -----------------------------------------------------------------------------
// Calendar days, for one-off blocks
// -----------------------------------------------------------------------------

export interface DateOption {
  /** `yyyy-MM-dd` in the chosen zone. */
  key: string;
  /** `'Tue 19 Aug 2026'`. */
  label: string;
}

/** `days` calendar days starting today, as read in `timeZone`. */
export function dateOptions(timeZone: string, days: number, from: Date = new Date()): DateOption[] {
  const today = new TZDate(from, timeZone);
  return Array.from({ length: days }, (_, index) => {
    const day = addDays(today, index);
    return { key: format(day, 'yyyy-MM-dd'), label: format(day, 'EEE d MMM yyyy') };
  });
}

/** Today's `yyyy-MM-dd` as read in `timeZone`. */
export function todayKey(timeZone: string, from: Date = new Date()): string {
  return format(new TZDate(from, timeZone), 'yyyy-MM-dd');
}

/**
 * A calendar day plus a wall clock, in a named zone, resolved to a real instant.
 *
 * A block is a `timestamptz` — an absolute interval, not a wall-clock window —
 * so turning "20 August, 9:00 AM" into one requires naming a zone. The screen
 * names it explicitly rather than reaching for the device's, because a
 * practitioner setting next month's holiday from an airport should not have it
 * silently recorded on airport time.
 */
export function instantFromWallClock(timeZone: string, dateKey: string, time: string): Date | null {
  if (!isValidTimeZone(timeZone)) return null;

  const parts = dateKey.split('-');
  const year = Number.parseInt(parts[0] ?? '', 10);
  const month = Number.parseInt(parts[1] ?? '', 10);
  const day = Number.parseInt(parts[2] ?? '', 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

  const midnight = TZDate.tz(timeZone, year, month - 1, day, 0, 0, 0, 0);
  return wallClockInstant(timeZone, midnight, timeToMinutes(time));
}

/**
 * The instant at which `minutes` past midnight reads on the clock in `timeZone`
 * on the calendar day `day` falls on.
 *
 * 1440 (midnight, end of day) is rolled to 00:00 the following day explicitly
 * rather than relying on hour-overflow normalisation inside `TZDate.tz`.
 */
function wallClockInstant(timeZone: string, day: TZDate, minutes: number): Date {
  const rolledDays = Math.floor(minutes / (24 * 60));
  const withinDay = minutes - rolledDays * 24 * 60;
  const target = rolledDays === 0 ? day : addDays(day, rolledDays);

  const zoned = TZDate.tz(
    timeZone,
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
    Math.floor(withinDay / 60),
    withinDay % 60,
    0,
    0,
  );
  return new Date(zoned.getTime());
}
