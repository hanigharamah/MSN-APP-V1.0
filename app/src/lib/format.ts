import { TZDate } from '@date-fns/tz';
import { format, formatDistanceToNowStrict, isSameDay, isToday, isYesterday } from 'date-fns';
import * as Localization from 'expo-localization';

/**
 * Formatting — the only place raw database values become human strings.
 *
 * ## Money
 * The database stores integer cents. Cents stay integers through every
 * calculation, sum and comparison in the app; they become a formatted string
 * exactly once, at render. If you find yourself writing `price / 100` outside
 * this file, that is the bug.
 *
 * ## Dates
 * Everything in the database is `timestamptz`, serialised as UTC ISO 8601.
 * There are two different correct ways to display one, and picking the wrong
 * one is the classic marketplace bug:
 *
 *   - **An offering's own time** (`events.starts_at`, `bookings.starts_at`)
 *     must be shown in the offering's `timezone` column. A retreat that starts
 *     at 9am in Bali starts at 9am in Bali whoever is looking at it. Use
 *     `formatEventTime(iso, event.timezone)`.
 *   - **A platform event** (message sent, order placed) is shown in the
 *     *viewer's* zone, because it is about them. Use `formatRelative` or
 *     `formatLocal`.
 *
 * Never call `new Date(iso).toLocaleString()` in a screen — it silently picks
 * the device zone for both cases and gets the first one wrong.
 */

// -----------------------------------------------------------------------------
// Locale and zone
// -----------------------------------------------------------------------------

/** The viewer's IANA zone, e.g. `'Europe/London'`. Falls back to UTC. */
export function deviceTimeZone(): string {
  const calendar = Localization.getCalendars()[0];
  return calendar?.timeZone ?? 'UTC';
}

/** The viewer's BCP-47 locale, e.g. `'en-GB'`. */
export function deviceLocale(): string {
  const locale = Localization.getLocales()[0];
  return locale?.languageTag ?? 'en-US';
}

// -----------------------------------------------------------------------------
// Money
// -----------------------------------------------------------------------------

/**
 * Formats integer cents as currency.
 *
 *   formatMoney(4500, 'USD')            -> '$45.00'
 *   formatMoney(4500, 'USD', { compact: true }) -> '$45'
 *   formatMoney(0, 'USD')               -> '$0.00'
 *
 * `compact` drops `.00` on whole amounts — right for a price on a card, wrong
 * for a receipt line, where the decimals reassure.
 */
export function formatMoney(
  cents: number,
  currency: string,
  options?: { compact?: boolean; locale?: string },
): string {
  const locale = options?.locale ?? deviceLocale();
  const isWhole = cents % 100 === 0;
  const fractionDigits = options?.compact && isWhole ? 0 : 2;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(cents / 100);
}

/**
 * Price label for a listing. Free is a word, not `$0.00` — the zero reads as
 * a rendering failure.
 */
export function formatPrice(
  cents: number,
  currency: string,
  options?: { isFree?: boolean; locale?: string },
): string {
  if (options?.isFree || cents === 0) return 'Free';
  return formatMoney(cents, currency, { compact: true, locale: options?.locale });
}

/** `formatTokens(1)` -> `'1 token'`. Tokens are never shown as currency. */
export function formatTokens(tokens: number): string {
  return `${tokens} ${tokens === 1 ? 'token' : 'tokens'}`;
}

// -----------------------------------------------------------------------------
// Dates — in a specific zone (offerings)
// -----------------------------------------------------------------------------

function inZone(iso: string, timeZone: string): TZDate {
  return new TZDate(new Date(iso), timeZone);
}

/**
 * An offering's start time, in the offering's own zone.
 *
 *   formatEventTime('2026-09-01T16:00:00Z', 'America/Los_Angeles')
 *   -> 'Tue 1 Sep, 9:00 AM'
 */
export function formatEventTime(iso: string, timeZone: string): string {
  return format(inZone(iso, timeZone), 'EEE d MMM, h:mm a');
}

/** Date only, in the offering's zone. `'Tue 1 Sep 2026'`. */
export function formatEventDate(iso: string, timeZone: string): string {
  return format(inZone(iso, timeZone), 'EEE d MMM yyyy');
}

/** Time only, in the offering's zone. `'9:00 AM'`. */
export function formatEventClock(iso: string, timeZone: string): string {
  return format(inZone(iso, timeZone), 'h:mm a');
}

/**
 * Start–end range, collapsing the date when both ends fall on the same day.
 *
 *   'Tue 1 Sep, 9:00 AM – 11:30 AM'
 *   'Tue 1 Sep, 9:00 AM – Thu 3 Sep, 4:00 PM'
 */
export function formatEventRange(startIso: string, endIso: string, timeZone: string): string {
  const start = inZone(startIso, timeZone);
  const end = inZone(endIso, timeZone);

  if (isSameDay(start, end)) {
    return `${format(start, 'EEE d MMM, h:mm a')} – ${format(end, 'h:mm a')}`;
  }
  return `${format(start, 'EEE d MMM, h:mm a')} – ${format(end, 'EEE d MMM, h:mm a')}`;
}

/**
 * The zone abbreviation to print next to a time when the viewer is somewhere
 * else. Returns `null` when the viewer is in the same zone, so the caller can
 * omit it — `'9:00 AM PDT'` is noise if you are in California.
 */
export function timeZoneSuffix(
  timeZone: string,
  /**
   * The instant being labelled. Pass it — the abbreviation is seasonal, so
   * formatting "now" labels a November booking with August's summer time
   * (BST for a GMT date, CEST for a CET one).
   */
  atIso?: string,
  viewerZone = deviceTimeZone(),
): string | null {
  if (timeZone === viewerZone) return null;
  const at = atIso ? new Date(atIso) : new Date();

  const abbreviation = (zone: string): string | null => {
    try {
      const parts = new Intl.DateTimeFormat(deviceLocale(), {
        timeZone: zone,
        timeZoneName: 'short',
      }).formatToParts(at);
      return parts.find((p) => p.type === 'timeZoneName')?.value ?? null;
    } catch {
      return null;
    }
  };

  const target = abbreviation(timeZone);

  // Hermes without full ICU accepts `timeZone` for numeric fields but ignores
  // it for `timeZoneName`, returning the DEVICE's abbreviation for every zone.
  // That is worse than no label: a Madrid booking rendered "(GMT)". If two
  // different zones produce the same abbreviation, the engine is not honouring
  // the request, so fall back to a computed offset — which is always right
  // because the numeric parts ARE zone-correct.
  if (target !== null && target !== abbreviation(viewerZone)) return target;
  return utcOffsetLabel(timeZone, at);
}

/**
 * `'GMT+2'` — derived by diffing the same instant rendered in the zone against
 * UTC, so it needs nothing from the engine beyond zone-correct numeric fields.
 */
function utcOffsetLabel(timeZone: string, at: Date): string {
  try {
    // `TZDate.getTimezoneOffset()` is minutes WEST of UTC, same sign convention
    // as the built-in Date, so Madrid in winter is -60 and we negate it.
    //
    // Deliberately not round-tripping through `toLocaleString` and re-parsing:
    // Hermes cannot parse its own `en-US` output back into a Date, which
    // produced a literal "GMT-NaN:NaN" on the event card.
    const minutes = -new TZDate(at, timeZone).getTimezoneOffset();
    if (!Number.isFinite(minutes)) return timeZone;
    if (minutes === 0) return 'GMT';

    const sign = minutes > 0 ? '+' : '−';
    const hours = Math.floor(Math.abs(minutes) / 60);
    const rest = Math.abs(minutes) % 60;
    return `GMT${sign}${hours}${rest === 0 ? '' : `:${String(rest).padStart(2, '0')}`}`;
  } catch {
    return timeZone;
  }
}

// -----------------------------------------------------------------------------
// Dates — in the viewer's zone (platform activity)
// -----------------------------------------------------------------------------

/** `'1 Sep 2026, 5:00 PM'` in the viewer's zone. */
export function formatLocal(iso: string): string {
  return format(inZone(iso, deviceTimeZone()), 'd MMM yyyy, h:mm a');
}

/** `'2 hours ago'`, `'3 days ago'`. For activity feeds and notifications. */
export function formatRelative(iso: string): string {
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

/**
 * Timestamp for a chat row: clock for today, `'Yesterday'`, weekday within the
 * week, date beyond that. The same shape every messaging app uses, because it
 * is the one people can scan.
 */
export function formatMessageTime(iso: string): string {
  const date = inZone(iso, deviceTimeZone());
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';

  const ageDays = (Date.now() - date.getTime()) / 86_400_000;
  if (ageDays < 7) return format(date, 'EEEE');
  return format(date, 'd MMM');
}

// -----------------------------------------------------------------------------
// Domain helpers
// -----------------------------------------------------------------------------

/**
 * Whether a booking is still inside its cancellation window.
 *
 * Reads `cancellation_window_hours` from the BOOKING, never from the service —
 * the booking holds the snapshot taken at purchase time, and the service may
 * have been edited since. Refund policy §2.3: undisclosed terms are not
 * binding.
 */
export function isWithinCancellationWindow(booking: {
  starts_at: string;
  cancellation_window_hours: number;
}): boolean {
  const deadline = new Date(booking.starts_at).getTime() - booking.cancellation_window_hours * 3_600_000;
  return Date.now() < deadline;
}

/** `'Free cancellation up to 24 hours before'`. */
export function formatCancellationWindow(hours: number): string {
  if (hours === 0) return 'No free cancellation';
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `Free cancellation up to ${days} ${days === 1 ? 'day' : 'days'} before`;
  }
  return `Free cancellation up to ${hours} ${hours === 1 ? 'hour' : 'hours'} before`;
}

/** `'1h 30m'` from a service's `duration_minutes`. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Two-letter fallback for an avatar with no image. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] as string).slice(0, 2).toUpperCase();
  return `${(words[0] as string)[0] ?? ''}${(words[words.length - 1] as string)[0] ?? ''}`.toUpperCase();
}
