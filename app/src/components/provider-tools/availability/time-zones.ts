import { tzOffset } from '@date-fns/tz';

import { deviceTimeZone } from '@/lib/format';

/**
 * Time-zone plumbing for the availability screen.
 *
 * A weekly rule is a **wall-clock window in one named zone**. `available_slots`
 * evaluates it as `(day + starts_time) at time zone rule.timezone`, so the zone
 * is not decoration — it is half the meaning of "9am". Everything here exists so
 * the screen can say which zone a rule is in, and what that zone's clock is
 * doing today.
 *
 * Nothing here calls `toLocaleString`. Offsets come from `tzOffset`, which falls
 * back to manual parsing when Hermes ships without full ICU, so the label is
 * still right on a device with no zone database beyond the current one.
 */

/**
 * Whether the runtime recognises an IANA id.
 *
 * Two checks, because they fail differently: `Intl.DateTimeFormat` throws a
 * `RangeError` on a genuinely unknown id, while `tzOffset` returns `NaN` when it
 * has fallen back to manual parsing and cannot resolve the name. A zone that
 * fails either one would silently produce `Invalid Date` downstream.
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    return false;
  }
  return Number.isFinite(tzOffset(timeZone, new Date()));
}

/**
 * `'GMT+1'`, `'GMT-3:30'`, `'GMT'` — the zone's offset at a given instant.
 *
 * Unlike `timeZoneSuffix` in `lib/format`, this never returns `null`. On this
 * screen the provider is *choosing* the zone, so it has to be labelled even when
 * it happens to match the device — "9:00 AM Europe/London" with no offset next
 * to it is exactly the ambiguity the screen is here to remove.
 */
export function offsetLabel(timeZone: string, at: Date = new Date()): string {
  const minutes = tzOffset(timeZone, at);
  if (!Number.isFinite(minutes)) return timeZone;
  if (minutes === 0) return 'GMT';

  const sign = minutes > 0 ? '+' : '−';
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  return `GMT${sign}${hours}${rest === 0 ? '' : `:${String(rest).padStart(2, '0')}`}`;
}

/** `'Europe/London'` -> `'Europe / London'`, for a picker row. */
export function timeZoneLabel(timeZone: string): string {
  return timeZone.split('/').join(' / ').split('_').join(' ');
}

/**
 * A short, honest list for the runtimes that cannot enumerate their own zone
 * database.
 *
 * Deliberately not exhaustive — it is a fallback, and the picker also carries
 * every zone already in use by an existing rule plus the device's own, so a
 * practitioner in a zone missing from this list can still see and keep theirs.
 * If their zone is absent AND they have no rule yet, that is a real gap; see the
 * TODO on `listTimeZones`.
 */
const FALLBACK_TIME_ZONES: readonly string[] = [
  'UTC',
  'Pacific/Auckland',
  'Australia/Sydney',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Jakarta',
  'Asia/Kolkata',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Tehran',
  'Asia/Jerusalem',
  'Africa/Nairobi',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Accra',
  'Europe/Istanbul',
  'Europe/Moscow',
  'Europe/Athens',
  'Europe/Helsinki',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Zurich',
  'Europe/Lisbon',
  'Europe/Dublin',
  'Europe/London',
  'Atlantic/Reykjavik',
  'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires',
  'America/Santiago',
  'America/Bogota',
  'America/Lima',
  'America/Mexico_City',
  'America/New_York',
  'America/Toronto',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Vancouver',
  'America/Anchorage',
  'Pacific/Honolulu',
];

/**
 * Every zone the picker offers, most-relevant first.
 *
 * `Intl.supportedValuesOf` is the full list when the runtime has it. Hermes
 * without full ICU does not, and there is no polyfill in this app's
 * dependencies, so the fallback above stands in.
 *
 * TODO(agent · availability): if a practitioner ever reports their zone missing
 * from the picker, the fix is a real IANA list — either `expo-localization`'s
 * calendar data or a small bundled zone table. Adding a dependency is out of
 * scope for this pass, and the device zone plus in-use zones cover the cases
 * that exist today.
 */
export function listTimeZones(inUse: readonly string[] = []): string[] {
  const device = deviceTimeZone();
  const supported = supportedTimeZones();

  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const zone of [device, ...inUse, ...supported]) {
    if (zone.length === 0 || seen.has(zone)) continue;
    seen.add(zone);
    ordered.push(zone);
  }
  return ordered;
}

function supportedTimeZones(): readonly string[] {
  // TypeScript's lib declares `supportedValuesOf` unconditionally; Hermes does
  // not always ship it. The runtime check is the point — without it this is a
  // `TypeError` on the devices that matter.
  if (typeof Intl.supportedValuesOf !== 'function') return FALLBACK_TIME_ZONES;
  try {
    const values = Intl.supportedValuesOf('timeZone');
    if (values.length > 0) return values;
  } catch {
    // Some builds have the function but no zone data behind it, and throw.
  }
  return FALLBACK_TIME_ZONES;
}
