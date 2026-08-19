import { isWebUrl } from '@/components/events';
import { railFor } from '@/lib/queries/bookings';
import { CLIENT_PLATFORM } from '@/lib/queries/functions';
import type { DeliveryMode, EventInsert, EventRow, EventUpdate, TicketType } from '@/types/database';

import {
  dstShiftNote,
  isValidTimeZone,
  partsFromIso,
  partsToUtcIso,
  validateDate,
  validateTime,
  type DateTimeParts,
} from './datetime';
import { normaliseCurrency, parseWholeNumber, validateCurrency } from './money';

/**
 * The event form, as data.
 *
 * Every field is the string the host typed, because that is what a `TextInput`
 * holds and because a half-typed number is a legitimate intermediate state
 * that `number | null` cannot represent. Conversion happens once, on save, in
 * `eventColumnsFrom`.
 *
 * Times are edited as wall-clock fields in the event's own `timezone` and
 * stored as UTC — see `datetime.ts`. The device's zone is used for exactly one
 * thing: the default zone offered on a brand-new event.
 *
 * This module is free of React and of the theme so the rules can be read, and
 * later tested, on their own.
 */

export const DELIVERY_MODES: readonly DeliveryMode[] = ['in_person', 'online_live', 'one_to_one'];

/** True when the database will demand a `meeting_url` before publishing. */
export function needsMeetingUrl(mode: DeliveryMode): boolean {
  return mode !== 'in_person';
}

export interface EventDraft {
  title: string;
  summary: string;
  description: string;
  cover_url: string;
  category_id: string | null;
  delivery_mode: DeliveryMode;

  venue_name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  region: string;
  country_code: string;
  postal_code: string;
  hide_exact_address: boolean;

  meeting_url: string;
  hide_meeting_url: boolean;

  starts: DateTimeParts;
  ends: DateTimeParts;
  timezone: string;

  capacity: string;
  min_age: string;

  is_free: boolean;
  currency: string;
}

export function emptyEventDraft(defaults: {
  timezone: string;
  starts: DateTimeParts;
  ends: DateTimeParts;
}): EventDraft {
  return {
    title: '',
    summary: '',
    description: '',
    cover_url: '',
    category_id: null,
    delivery_mode: 'in_person',

    venue_name: '',
    address_line1: '',
    address_line2: '',
    city: '',
    region: '',
    country_code: '',
    postal_code: '',
    hide_exact_address: false,

    meeting_url: '',
    hide_meeting_url: true,

    starts: defaults.starts,
    ends: defaults.ends,
    timezone: defaults.timezone,

    capacity: '',
    min_age: '',

    is_free: false,
    currency: 'USD',
  };
}

export function eventDraftFrom(event: EventRow): EventDraft {
  return {
    title: event.title,
    summary: event.summary ?? '',
    description: event.description ?? '',
    cover_url: event.cover_url ?? '',
    category_id: event.category_id,
    delivery_mode: event.delivery_mode,

    venue_name: event.venue_name ?? '',
    address_line1: event.address_line1 ?? '',
    address_line2: event.address_line2 ?? '',
    city: event.city ?? '',
    region: event.region ?? '',
    country_code: event.country_code ?? '',
    postal_code: event.postal_code ?? '',
    hide_exact_address: event.hide_exact_address,

    meeting_url: event.meeting_url ?? '',
    hide_meeting_url: event.hide_meeting_url,

    starts: partsFromIso(event.starts_at, event.timezone),
    ends: partsFromIso(event.ends_at, event.timezone),
    timezone: event.timezone,

    capacity: event.capacity === null ? '' : String(event.capacity),
    min_age: event.min_age === null ? '' : String(event.min_age),

    is_free: event.is_free,
    currency: event.currency,
  };
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

/** Field id -> message, or null. Shaped to drop straight into `<Input error>`. */
export type EventDraftErrors = Record<EventFieldId, string | null>;

export type EventFieldId =
  | 'title'
  | 'summary'
  | 'cover_url'
  | 'meeting_url'
  | 'country_code'
  | 'timezone'
  | 'starts_date'
  | 'starts_time'
  | 'ends_date'
  | 'ends_time'
  | 'capacity'
  | 'min_age'
  | 'currency';

const MAX_TITLE = 200;
const MAX_SUMMARY = 300;
/** `min_age` is a `smallint`. Ages beyond this are a typo, not a policy. */
const MAX_AGE = 120;

export function validateEventDraft(draft: EventDraft): EventDraftErrors {
  const title = draft.title.trim();
  const zoneValid = isValidTimeZone(draft.timezone);

  const startsIso = zoneValid ? partsToUtcIso(draft.starts, draft.timezone) : null;
  const endsIso = zoneValid ? partsToUtcIso(draft.ends, draft.timezone) : null;

  return {
    title:
      title.length === 0
        ? 'Give your event a title.'
        : title.length > MAX_TITLE
          ? `Titles are at most ${MAX_TITLE} characters.`
          : null,

    summary:
      draft.summary.trim().length > MAX_SUMMARY
        ? `Keep the summary under ${MAX_SUMMARY} characters — it is the line on the listing card.`
        : null,

    cover_url:
      draft.cover_url.trim().length > 0 && !isWebUrl(draft.cover_url)
        ? 'Cover images need a full https:// address.'
        : null,

    // Only a *published* non-in-person event needs a link
    // (`events_online_needs_link` exempts drafts), so an empty field is fine
    // here and the publish checklist is what refuses to go live without it.
    meeting_url:
      draft.meeting_url.trim().length > 0 && !isWebUrl(draft.meeting_url)
        ? 'Joining links need a full https:// address.'
        : null,

    country_code: countryCodeError(draft.country_code),

    timezone: zoneValid
      ? null
      : 'That is not a time zone this device knows. Use an IANA name like Europe/London.',

    starts_date: validateDate(draft.starts.date),
    starts_time: validateTime(draft.starts.time),

    ends_date: validateDate(draft.ends.date),
    // `events_end_after_start` is a check constraint, so the database refuses
    // this write outright. Attached to the end time because that is the field
    // the host will change.
    ends_time:
      validateTime(draft.ends.time) ??
      (startsIso !== null && endsIso !== null && Date.parse(endsIso) <= Date.parse(startsIso)
        ? 'The event has to end after it starts.'
        : null),

    capacity: optionalPositiveIntError(draft.capacity, 'Capacity'),

    min_age: (() => {
      const raw = draft.min_age.trim();
      if (raw.length === 0) return null;
      const value = parseWholeNumber(raw);
      if (value === null) return 'Use a whole number of years, or leave it blank.';
      if (value > MAX_AGE) return `That looks like a typo — the maximum is ${MAX_AGE}.`;
      return null;
    })(),

    currency: validateCurrency(draft.currency),
  };
}

function countryCodeError(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return /^[A-Za-z]{2}$/.test(trimmed) ? null : 'Use the 2-letter country code, like GB or US.';
}

function optionalPositiveIntError(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = parseWholeNumber(trimmed);
  if (parsed === null) return `${label} has to be a whole number, or blank for no limit.`;
  // `capacity is null or capacity > 0` — zero is rejected by the constraint,
  // and "blank" is how you say unlimited.
  if (parsed === 0) return `Leave ${label.toLowerCase()} blank for no limit rather than setting 0.`;
  return null;
}

export function hasEventDraftErrors(errors: EventDraftErrors): boolean {
  return Object.values(errors).some((message) => message !== null);
}

/** Non-blocking notes: a real instant was stored, just not the one typed. */
export function eventDraftNotes(draft: EventDraft): {
  starts: string | null;
  ends: string | null;
} {
  return {
    starts: dstShiftNote(draft.starts, draft.timezone),
    ends: dstShiftNote(draft.ends, draft.timezone),
  };
}

// -----------------------------------------------------------------------------
// Draft -> columns
// -----------------------------------------------------------------------------

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * The columns a draft maps onto.
 *
 * Fields belonging to the delivery mode that is *not* selected are written as
 * null rather than carried along invisibly. A host who switches an event from
 * a hall to a livestream would otherwise keep a published address for a place
 * nobody is going to, and `hide_exact_address` would be guarding a venue that
 * no longer applies.
 *
 * Throws when the timestamps do not parse. Callers validate first — this is
 * the guard that stops an `Invalid Date` reaching PostgREST as a bare 400.
 */
function eventColumnsFrom(draft: EventDraft): Omit<EventInsert, 'host_id'> {
  const startsAt = partsToUtcIso(draft.starts, draft.timezone);
  const endsAt = partsToUtcIso(draft.ends, draft.timezone);
  if (startsAt === null || endsAt === null) {
    throw new Error('eventColumnsFrom called with unvalidated dates.');
  }

  const inPerson = draft.delivery_mode === 'in_person';

  return {
    title: draft.title.trim(),
    summary: trimmedOrNull(draft.summary),
    description: trimmedOrNull(draft.description),
    cover_url: trimmedOrNull(draft.cover_url),
    category_id: draft.category_id,
    delivery_mode: draft.delivery_mode,

    venue_name: inPerson ? trimmedOrNull(draft.venue_name) : null,
    address_line1: inPerson ? trimmedOrNull(draft.address_line1) : null,
    address_line2: inPerson ? trimmedOrNull(draft.address_line2) : null,
    city: inPerson ? trimmedOrNull(draft.city) : null,
    region: inPerson ? trimmedOrNull(draft.region) : null,
    country_code: inPerson ? upperOrNull(draft.country_code) : null,
    postal_code: inPerson ? trimmedOrNull(draft.postal_code) : null,
    hide_exact_address: inPerson ? draft.hide_exact_address : false,

    meeting_url: inPerson ? null : trimmedOrNull(draft.meeting_url),
    hide_meeting_url: draft.hide_meeting_url,

    starts_at: startsAt,
    ends_at: endsAt,
    timezone: draft.timezone.trim(),

    capacity: parseWholeNumber(draft.capacity),
    min_age: parseWholeNumber(draft.min_age),

    is_free: draft.is_free,
    currency: normaliseCurrency(draft.currency),
  };
}

function upperOrNull(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * A new event is always created as a draft. `status` is left at its default
 * and `published_at` is never set here — going live is `publishEvent`, which
 * writes both columns in one statement because
 * `events_published_has_timestamp` requires it.
 */
export function eventDraftToInsert(draft: EventDraft, hostId: string): EventInsert {
  return { ...eventColumnsFrom(draft), host_id: hostId };
}

/** Never touches `status`, `published_at` or `host_id`. */
export function eventDraftToUpdate(draft: EventDraft): EventUpdate {
  return eventColumnsFrom(draft);
}

// -----------------------------------------------------------------------------
// Publish readiness
// -----------------------------------------------------------------------------

export type PublishCheckSeverity =
  /** The database will refuse the write. Publishing is disabled. */
  | 'blocker'
  /** The write succeeds but the event will not sell. Publishing is allowed. */
  | 'warning'
  /** Nothing to do — stated so the absence of a control is not a mystery. */
  | 'info';

export interface PublishCheck {
  id: string;
  severity: PublishCheckSeverity;
  title: string;
  detail: string;
  /** The check constraint or server error code this mirrors, when there is one. */
  source?: string;
}

/**
 * Everything that decides whether this event can go on sale, listed before the
 * attempt rather than discovered from a failed one.
 *
 * The blockers mirror check constraints exactly, so the list is
 * `canPublish === false` for precisely the rows Postgres would reject. The
 * warnings mirror refusals `create-checkout` makes at purchase time — those
 * publish fine and then fail the first customer, which is the worse outcome
 * and the reason they are surfaced here at all.
 */
export function publishChecksFor(
  event: Pick<EventRow, 'delivery_mode' | 'starts_at' | 'ends_at' | 'meeting_url' | 'is_free'>,
  tickets: readonly TicketType[],
  now: number = Date.now(),
): PublishCheck[] {
  const checks: PublishCheck[] = [];

  if (Date.parse(event.ends_at) <= Date.parse(event.starts_at)) {
    checks.push({
      id: 'end_after_start',
      severity: 'blocker',
      title: 'The end time is not after the start time',
      detail: 'Change the end time on the Details tab. The database rejects the row otherwise.',
      source: 'events_end_after_start',
    });
  }

  if (needsMeetingUrl(event.delivery_mode) && !isWebUrl(event.meeting_url)) {
    checks.push({
      id: 'online_needs_link',
      severity: 'blocker',
      title: 'This event needs a joining link',
      detail:
        'Anything that is not in person must carry a https:// joining link before it can leave draft. Drafts are exempt; publishing is not.',
      source: 'events_online_needs_link',
    });
  }

  if (Date.parse(event.starts_at) <= now) {
    checks.push({
      id: 'starts_in_past',
      severity: 'warning',
      title: 'This event starts in the past',
      detail:
        'It will publish, but the discovery feed hides events that have already started, so nobody will find it.',
    });
  }

  const active = tickets.filter((ticket) => ticket.is_active);
  if (active.length === 0) {
    checks.push({
      id: 'no_tickets',
      severity: 'warning',
      title: 'No active ticket tiers',
      detail:
        'The event will be visible but nothing can be bought. Add at least one tier on the Tickets tab.',
    });
  }

  // `events.is_free` is a listing flag, not a price. Nothing reconciles it
  // with `ticket_types.price_cents`, so the two can disagree and the listing
  // says "Free" over tickets that charge.
  if (event.is_free && active.some((ticket) => ticket.price_cents > 0)) {
    checks.push({
      id: 'free_but_priced',
      severity: 'warning',
      title: 'Marked free, but some tiers charge',
      detail:
        'The listing will say Free while checkout asks for money. Either turn off "Free event" or set every active tier to 0.',
    });
  }

  const currencies = [...new Set(active.map((ticket) => normaliseCurrency(ticket.currency)))];
  if (currencies.length > 1) {
    checks.push({
      id: 'mixed_currency',
      severity: 'warning',
      title: `Ticket tiers mix ${currencies.join(' and ')}`,
      detail:
        'One payment cannot span two currencies. Checkout refuses the whole basket with a 422, so this event is effectively unbuyable until every active tier uses one currency.',
      source: 'mixed_currency',
    });
  }

  if (railFor(event.delivery_mode, 'ios') === 'apple_iap') {
    checks.push({
      id: 'iap_required',
      severity: 'warning',
      title: 'Live online events must be sold through in-app purchase on iOS',
      detail:
        'App Store guideline 3.1.3(d) applies to one-to-many live events. In-app purchase is not switched on in this build, so checkout returns a 403 on iOS today. Buyers on Android and the web are unaffected.',
      source: '3.1.3(d)',
    });
  }

  checks.push({
    id: 'published_timestamp',
    severity: 'info',
    title: 'The publish timestamp is set for you',
    detail:
      'Status and published_at have to move in the same statement, so there is no field for it here.',
    source: 'events_published_has_timestamp',
  });

  return checks;
}

export function canPublish(checks: readonly PublishCheck[]): boolean {
  return !checks.some((check) => check.severity === 'blocker');
}

/**
 * The warning a host sees while *creating* an event, before there is a row to
 * check. Delivery mode decides the payment rail, and the rail is not a
 * preference — it is Apple's rule, and hearing about it after a customer fails
 * to buy is the outcome this exists to prevent.
 *
 * Read against `CLIENT_PLATFORM` for the "today" sentence so the prediction
 * and `create-checkout`'s refusal cannot disagree, and against `'ios'` for the
 * rule itself, which applies to iOS buyers whatever the host is holding.
 */
export function paymentRailNoticeFor(mode: DeliveryMode): string | null {
  if (railFor(mode, 'ios') !== 'apple_iap') return null;

  const here =
    railFor(mode, CLIENT_PLATFORM) === 'apple_iap'
      ? 'On this device checkout returns a 403 today, because in-app purchase is not switched on in this build.'
      : 'Buyers on this platform are unaffected; buyers on iOS cannot complete a purchase in this build.';

  return `Live online events have to be sold through Apple's in-app purchase on iOS (guideline 3.1.3(d)). ${here} In-person events must not use in-app purchase (3.1.3(e)), so switching the delivery mode changes how the event is paid for.`;
}
