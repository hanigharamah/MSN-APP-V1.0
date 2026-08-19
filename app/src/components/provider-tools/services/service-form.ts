import type { DeliveryMode, Service, ServiceInsert, ServiceUpdate } from '@/types/database';

/**
 * The service form's draft model, and the conversions between it and the
 * database row.
 *
 * Everything a person types is a string, and it stays a string until it
 * validates. The parsed shape (`ServiceValues`) is what the mutation sends, so
 * a screen can never accidentally post `NaN` or a price that was typed but
 * never understood.
 *
 * ## Money
 *
 * `price_cents` is an integer everywhere (CONVENTIONS §8). The field is in
 * major units because nobody prices a session at "4500", so this module owns
 * the two conversions — and does both with string arithmetic rather than
 * `* 100` / `/ 100`, which is not only the rule but also the only way to keep
 * `19.99` from arriving as 1998.9999999999998.
 */

// The columns are `smallint`, so anything above this is a 22003 numeric
// overflow from Postgres rather than a check-constraint violation, and the
// message would be unreadable. Caught here instead.
const SMALLINT_MAX = 32767;

/** `price_cents` is a plain `integer`; this keeps a fat-fingered price sane. */
const MAX_PRICE_CENTS = 999_999_999;

const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 2000;

export interface ServiceDraft {
  title: string;
  description: string;
  cover_url: string;
  delivery_mode: DeliveryMode;
  duration_minutes: string;
  buffer_minutes: string;
  /** Major units, exactly as typed — `'45'`, `'45.50'`. */
  price: string;
  currency: string;
  cancellation_window_hours: string;
  requires_approval: boolean;
}

/** The draft once every field has been understood. Ready for the database. */
export interface ServiceValues {
  title: string;
  description: string | null;
  cover_url: string | null;
  delivery_mode: DeliveryMode;
  duration_minutes: number;
  buffer_minutes: number;
  price_cents: number;
  currency: string;
  cancellation_window_hours: number;
  requires_approval: boolean;
}

/**
 * A new service, pre-filled with the column defaults from migration 0003 so
 * the form and the database agree about what "untouched" means.
 */
export const NEW_SERVICE_DRAFT: ServiceDraft = {
  title: '',
  description: '',
  cover_url: '',
  delivery_mode: 'one_to_one',
  duration_minutes: '60',
  buffer_minutes: '0',
  price: '',
  currency: 'USD',
  cancellation_window_hours: '24',
  requires_approval: false,
};

export function draftFromService(service: Service): ServiceDraft {
  return {
    title: service.title,
    description: service.description ?? '',
    cover_url: service.cover_url ?? '',
    delivery_mode: service.delivery_mode,
    duration_minutes: String(service.duration_minutes),
    buffer_minutes: String(service.buffer_minutes),
    price: centsToInput(service.price_cents),
    currency: service.currency,
    cancellation_window_hours: String(service.cancellation_window_hours),
    requires_approval: service.requires_approval,
  };
}

// -----------------------------------------------------------------------------
// Parsing
// -----------------------------------------------------------------------------

/** Whole digits and at most 2 decimals, `.` or `,` as the separator. */
const PRICE_PATTERN = /^(\d{1,9})(?:[.,](\d{1,2}))?$/;

/**
 * `'45.5'` -> `4550`. Returns null when the string is not a price.
 *
 * String arithmetic on purpose: `Math.round(Number('19.99') * 100)` happens to
 * work, but the same expression on `8.115` does not, and a price that is one
 * cent off is the kind of bug nobody finds until a customer does.
 */
export function parsePriceToCents(raw: string): number | null {
  const trimmed = raw.trim();
  const match = PRICE_PATTERN.exec(trimmed);
  if (!match) return null;

  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const cents = Number(`${whole}${fraction}`);
  return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * `4550` -> `'45.50'`, `4500` -> `'45'`. The inverse of the above, for seeding
 * the field when editing.
 *
 * Not `formatMoney` — that produces `'$45.00'`, which is a rendered price, not
 * something a text input can hand back. Still no division: the digits are
 * sliced apart.
 */
export function centsToInput(cents: number): string {
  const digits = String(Math.max(0, Math.trunc(cents))).padStart(3, '0');
  const whole = digits.slice(0, -2);
  const fraction = digits.slice(-2);
  return fraction === '00' ? whole : `${whole}.${fraction}`;
}

/** A non-negative whole number, or null. Rejects `'1.5'`, `'-2'` and `''`. */
export function parseWholeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d{1,9}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

export type ServiceFieldErrors = Record<keyof ServiceDraft, string | null>;

/**
 * Every message is written for the person typing, and every rule below mirrors
 * something the database would otherwise reject — the check constraints in
 * migration 0003 (`duration_minutes > 0`, `buffer_minutes >= 0`,
 * `price_cents >= 0`, `char(3)` currency) and the smallint ranges. Client
 * validation is a courtesy, not a guarantee (see `lib/validation.ts`).
 */
export function validateDraft(draft: ServiceDraft): ServiceFieldErrors {
  return {
    title: validateTitle(draft.title),
    description:
      draft.description.length > DESCRIPTION_MAX_LENGTH
        ? `That is longer than ${DESCRIPTION_MAX_LENGTH} characters.`
        : null,
    cover_url: validateCoverUrl(draft.cover_url),
    delivery_mode: null,
    duration_minutes: validateMinutes(draft.duration_minutes, {
      required: true,
      missing: 'Say how long the session runs.',
      zero: 'A session has to last at least a minute.',
    }),
    buffer_minutes: validateMinutes(draft.buffer_minutes, {
      required: false,
      missing: null,
      zero: null,
    }),
    price: validatePrice(draft.price),
    currency: /^[A-Za-z]{3}$/.test(draft.currency.trim())
      ? null
      : 'Use a three-letter currency code, like USD or GBP.',
    cancellation_window_hours: validateHours(draft.cancellation_window_hours),
    requires_approval: null,
  };
}

function validateTitle(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Give the service a name.';
  if (trimmed.length < 3) return 'That name is too short to tell anyone what it is.';
  if (trimmed.length > TITLE_MAX_LENGTH) {
    return `Keep the name under ${TITLE_MAX_LENGTH} characters.`;
  }
  return null;
}

function validateCoverUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null; // optional
  if (!/^https?:\/\/\S+$/i.test(trimmed)) {
    return 'Paste a full web address, starting with https://';
  }
  return null;
}

function validateMinutes(
  value: string,
  copy: { required: boolean; missing: string | null; zero: string | null },
): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return copy.required ? copy.missing : null;

  const minutes = parseWholeNumber(trimmed);
  if (minutes === null) return 'Use whole minutes, digits only.';
  if (minutes === 0 && copy.zero !== null) return copy.zero;
  if (minutes > SMALLINT_MAX) return `That cannot be more than ${SMALLINT_MAX} minutes.`;
  return null;
}

function validatePrice(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Enter a price. Put 0 if the session is free.';

  const cents = parsePriceToCents(trimmed);
  if (cents === null) return 'Enter an amount like 45 or 45.50.';
  if (cents > MAX_PRICE_CENTS) return 'That price is higher than the app can take.';
  return null;
}

function validateHours(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Enter a number of hours. Put 0 for no free cancellation.';

  const hours = parseWholeNumber(trimmed);
  if (hours === null) return 'Use whole hours, digits only.';
  if (hours > SMALLINT_MAX) return `That cannot be more than ${SMALLINT_MAX} hours.`;
  return null;
}

export function firstError(errors: ServiceFieldErrors): string | null {
  for (const message of Object.values(errors)) {
    if (message !== null) return message;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Draft -> database
// -----------------------------------------------------------------------------

/**
 * The parsed draft, or null when it does not validate.
 *
 * Optional text goes back as `null` rather than `''` — the columns are
 * nullable, and an empty string is a value that sorts, matches and renders as
 * an empty paragraph.
 */
export function valuesFromDraft(draft: ServiceDraft): ServiceValues | null {
  if (firstError(validateDraft(draft)) !== null) return null;

  const priceCents = parsePriceToCents(draft.price);
  const duration = parseWholeNumber(draft.duration_minutes);
  if (priceCents === null || duration === null) return null;

  const trimmedOrNull = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  return {
    title: draft.title.trim(),
    description: trimmedOrNull(draft.description),
    cover_url: trimmedOrNull(draft.cover_url),
    delivery_mode: draft.delivery_mode,
    duration_minutes: duration,
    // Blank means none, which is also the column default.
    buffer_minutes: parseWholeNumber(draft.buffer_minutes) ?? 0,
    price_cents: priceCents,
    currency: draft.currency.trim().toUpperCase(),
    cancellation_window_hours: parseWholeNumber(draft.cancellation_window_hours) ?? 0,
    requires_approval: draft.requires_approval,
  };
}

export function toInsert(values: ServiceValues, providerId: string): ServiceInsert {
  return { ...values, provider_id: providerId };
}

/**
 * `is_active` is deliberately absent: it is owned by the toggle on the list,
 * not by this form. Sending it here would let a stale draft resurrect a service
 * the provider paused in another tab.
 */
export function toUpdate(values: ServiceValues): ServiceUpdate {
  return { ...values };
}
