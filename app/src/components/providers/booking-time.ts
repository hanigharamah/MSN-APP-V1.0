import { TZDate } from '@date-fns/tz';
import { addDays, format } from 'date-fns';

import { deviceTimeZone } from '@/lib/format';
import type { TimeSlot } from '@/lib/queries/services';

/**
 * Time helpers for the slot picker.
 *
 * ## Which zone wins
 *
 * `available_slots` returns UTC instants. A one-to-one session is a meeting
 * between two people rather than a place you travel to, so the slots are
 * rendered in the **viewer's** zone — that is the clock the seeker will act on
 * — and the practitioner's wall-clock time is printed alongside whenever the
 * two zones differ. Nothing here ever calls `toLocaleString`; everything goes
 * through an explicit zone.
 *
 * ## Why the RPC window is padded
 *
 * `available_slots` takes `from_date` / `to_date` as **dates**, and walks whole
 * days in the *provider's* own zone. The date strip walks days in the
 * *viewer's* zone. When the two are far apart, the viewer's first and last days
 * straddle a provider-zone day the unpadded range would have excluded, so the
 * strip would show an empty morning that is actually bookable. `rpcDateRange`
 * pads each end and the grouping below discards anything that falls outside the
 * visible strip.
 */

/** How many days the date strip offers. Two weeks is the web app's window. */
export const DATE_STRIP_DAYS = 14;

/**
 * Days of slack added to each end of the RPC's date range.
 *
 * A provider-local wall clock on date `D` lands on viewer date
 * `D + floor((localTime + Δ) / 24h)`, where Δ is the viewer's offset minus the
 * provider's. One day of padding covers every pair with `|Δ| < 24h`, which is
 * almost every pair — but not all of them. Pacific/Kiritimati (UTC+14) against
 * Pacific/Pago_Pago (UTC-11) is Δ = 25h, and a rule running to 23:30 in Pago
 * Pago lands **two** viewer days later in Kiritimati. With a one-day pad that
 * slot is generated for a date the RPC was never asked about, and the seeker is
 * shown an empty first day that is really bookable.
 *
 * Two days closes it for every zone pair that exists (the widest possible Δ is
 * 26h). The cost is four extra rows out of `generate_series`; `groupSlotsByDay`
 * and `hasAnySlots` already discard buckets outside the visible strip, so
 * nothing leaks into the UI.
 */
export const RPC_RANGE_PAD_DAYS = 2;

export interface DayOption {
  /** `yyyy-MM-dd` in the viewer's zone. The identity used for selection. */
  key: string;
  /** `'Mon'`. */
  weekday: string;
  /** `'3'`. */
  dayOfMonth: string;
  /** `'Sep'`. */
  month: string;
  isToday: boolean;
}

/** The `yyyy-MM-dd` an instant falls on, in a given zone. */
export function dayKeyOf(iso: string, timeZone: string): string {
  return format(new TZDate(new Date(iso), timeZone), 'yyyy-MM-dd');
}

/** The days the strip offers, starting today in the viewer's zone. */
export function buildDayOptions(
  timeZone: string,
  days: number = DATE_STRIP_DAYS,
  now: Date = new Date(),
): DayOption[] {
  const today = new TZDate(now, timeZone);
  const todayKey = format(today, 'yyyy-MM-dd');

  return Array.from({ length: days }, (_, index) => {
    const day = addDays(today, index);
    const key = format(day, 'yyyy-MM-dd');
    return {
      key,
      weekday: format(day, 'EEE'),
      dayOfMonth: format(day, 'd'),
      month: format(day, 'MMM'),
      isToday: key === todayKey,
    };
  });
}

/**
 * The `from_date` / `to_date` to hand `available_slots`, padded at each end.
 * See the note at the top of this file and `RPC_RANGE_PAD_DAYS`.
 *
 * The strip covers `[today, today + days - 1]` in the viewer's zone; the range
 * returned here covers that window plus the pad on both sides.
 */
export function rpcDateRange(
  timeZone: string,
  days: number = DATE_STRIP_DAYS,
  now: Date = new Date(),
): { fromDate: string; toDate: string } {
  const today = new TZDate(now, timeZone);
  return {
    fromDate: format(addDays(today, -RPC_RANGE_PAD_DAYS), 'yyyy-MM-dd'),
    toDate: format(addDays(today, days - 1 + RPC_RANGE_PAD_DAYS), 'yyyy-MM-dd'),
  };
}

/**
 * Buckets slots by the viewer-zone day they land on, dropping anything already
 * in the past.
 *
 * The past filter is belt and braces — the SQL function excludes elapsed slots
 * — but a picker left open over a lunch break would otherwise keep offering a
 * time that has since gone, and the server would reject it at confirm time.
 */
export function groupSlotsByDay(
  slots: readonly TimeSlot[],
  timeZone: string,
  now: Date = new Date(),
): Map<string, TimeSlot[]> {
  const grouped = new Map<string, TimeSlot[]>();
  const floor = now.getTime();

  for (const slot of slots) {
    if (new Date(slot.startsAt).getTime() <= floor) continue;
    const key = dayKeyOf(slot.startsAt, timeZone);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(slot);
    else grouped.set(key, [slot]);
  }

  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
  return grouped;
}

/**
 * Whether the practitioner keeps a different clock from the viewer.
 *
 * Compared by zone id rather than current offset on purpose: two zones can
 * share an offset today and diverge across a DST boundary, and the booking may
 * be on the far side of one.
 */
export function isCrossTimeZone(providerTimeZone: string, viewerTimeZone = deviceTimeZone()): boolean {
  return providerTimeZone !== viewerTimeZone;
}
