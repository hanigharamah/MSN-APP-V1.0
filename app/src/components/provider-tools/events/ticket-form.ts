import type { TicketType, TicketTypeInsert, TicketTypeUpdate } from '@/types/database';

import {
  EMPTY_PARTS,
  isPartsEmpty,
  isPartsPartial,
  partsFromIso,
  partsToUtcIso,
  validateDate,
  validateTime,
  type DateTimeParts,
} from './datetime';
import {
  centsToAmountInput,
  normaliseCurrency,
  parseAmountToCents,
  parseWholeNumber,
  validateCurrency,
} from './money';

/**
 * A ticket tier, as form data.
 *
 * Three of these fields have caused production defects and are validated
 * accordingly:
 *
 *  - **The sale window.** `ticket_sales_window_valid` requires
 *    `sales_end_at > sales_start_at` when both are set. MSN-DEV-2247 was a
 *    malformed date reaching this pair, so a half-entered timestamp (a date
 *    with no time) is an error here rather than a silent null.
 *  - **Currency.** `ticket_types.currency` is per row and is NOT constrained to
 *    `events.currency`. Two tiers in different currencies make the event
 *    unbuyable — `create-checkout` refuses the basket with a 422
 *    `mixed_currency` — so the field is locked to whatever the event's other
 *    tiers already use.
 *  - **Quantity.** `ticket_not_oversold` requires `quantity_sold <= quantity`,
 *    so a tier cannot be shrunk below what has already been sold.
 *
 * `quantity_sold` is maintained by the checkout Edge Function. Nothing in this
 * file writes it.
 */

export interface TicketDraft {
  name: string;
  description: string;
  /** Decimal text, e.g. `'45.00'`. Converted to integer cents on save. */
  price: string;
  currency: string;
  /** Blank means unlimited (`quantity is null`). */
  quantity: string;
  max_per_order: string;
  /** Both halves blank = no bound in that direction. */
  sales_start: DateTimeParts;
  sales_end: DateTimeParts;
  is_active: boolean;
}

export const DEFAULT_MAX_PER_ORDER = 10;

export function emptyTicketDraft(currency: string): TicketDraft {
  return {
    name: '',
    description: '',
    price: '0.00',
    currency: normaliseCurrency(currency),
    quantity: '',
    max_per_order: String(DEFAULT_MAX_PER_ORDER),
    sales_start: EMPTY_PARTS,
    sales_end: EMPTY_PARTS,
    is_active: true,
  };
}

/** Sale windows are edited in the EVENT's zone, like every other event time. */
export function ticketDraftFrom(ticket: TicketType, timeZone: string): TicketDraft {
  return {
    name: ticket.name,
    description: ticket.description ?? '',
    price: centsToAmountInput(ticket.price_cents),
    currency: normaliseCurrency(ticket.currency),
    quantity: ticket.quantity === null ? '' : String(ticket.quantity),
    max_per_order: String(ticket.max_per_order),
    sales_start:
      ticket.sales_start_at === null ? EMPTY_PARTS : partsFromIso(ticket.sales_start_at, timeZone),
    sales_end:
      ticket.sales_end_at === null ? EMPTY_PARTS : partsFromIso(ticket.sales_end_at, timeZone),
    is_active: ticket.is_active,
  };
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

export type TicketFieldId =
  | 'name'
  | 'price'
  | 'currency'
  | 'quantity'
  | 'max_per_order'
  | 'sales_start'
  | 'sales_end';

export type TicketDraftErrors = Record<TicketFieldId, string | null>;

export interface TicketValidationContext {
  /** The event's zone. Sale windows are wall-clock times in it. */
  timeZone: string;
  /**
   * The currency every other tier on this event already uses, or null when
   * this is the first tier and the choice is still open.
   */
  lockedCurrency: string | null;
  /** `quantity_sold` for the tier being edited. Zero for a new one. */
  quantitySold: number;
}

/** `max_per_order` is a `smallint`. */
const MAX_PER_ORDER_CEILING = 32_767;

export function validateTicketDraft(
  draft: TicketDraft,
  context: TicketValidationContext,
): TicketDraftErrors {
  const startIso = partsToUtcIso(draft.sales_start, context.timeZone);
  const endIso = partsToUtcIso(draft.sales_end, context.timeZone);

  return {
    name: draft.name.trim().length === 0 ? 'Give the tier a name, like "Early bird".' : null,

    price:
      parseAmountToCents(draft.price) === null
        ? 'Enter an amount like 45 or 45.00. Use 0 for a free tier.'
        : null,

    currency: currencyError(draft.currency, context.lockedCurrency),

    quantity: quantityError(draft.quantity, context.quantitySold),

    max_per_order: maxPerOrderError(draft.max_per_order),

    sales_start: windowEndpointError(draft.sales_start, 'Sales open'),

    // `ticket_sales_window_valid` is a check constraint — the row is rejected
    // outright, so this is reported on the field rather than as a save error.
    sales_end:
      windowEndpointError(draft.sales_end, 'Sales close') ??
      (startIso !== null && endIso !== null && Date.parse(endIso) <= Date.parse(startIso)
        ? 'Sales have to close after they open.'
        : null),
  };
}

function currencyError(value: string, locked: string | null): string | null {
  const format = validateCurrency(value);
  if (format !== null) return format;
  if (locked !== null && normaliseCurrency(value) !== locked) {
    return `The other tiers on this event are priced in ${locked}. One payment cannot span two currencies, so every tier has to match.`;
  }
  return null;
}

function quantityError(value: string, sold: number): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null; // unlimited

  const parsed = parseWholeNumber(trimmed);
  if (parsed === null) return 'Use a whole number, or leave it blank for unlimited.';
  if (parsed < sold) {
    return `${sold} ${sold === 1 ? 'ticket has' : 'tickets have'} already been sold, so this cannot go below ${sold}.`;
  }
  return null;
}

function maxPerOrderError(value: string): string | null {
  const parsed = parseWholeNumber(value);
  if (parsed === null) return 'Enter a whole number.';
  if (parsed > MAX_PER_ORDER_CEILING) return `The maximum is ${MAX_PER_ORDER_CEILING}.`;
  return null;
}

/**
 * An optional timestamp is either fully set or fully blank. A date with no
 * time is the shape MSN-DEV-2247 arrived in, so it is refused at the field.
 */
function windowEndpointError(parts: DateTimeParts, label: string): string | null {
  if (isPartsEmpty(parts)) return null;
  if (isPartsPartial(parts)) {
    return `${label} needs both a date and a time, or neither.`;
  }
  return validateDate(parts.date) ?? validateTime(parts.time);
}

export function hasTicketDraftErrors(errors: TicketDraftErrors): boolean {
  return Object.values(errors).some((message) => message !== null);
}

/**
 * Advisory notes that are not errors. `max_per_order` has no positive check
 * constraint, so zero saves cleanly and then quietly makes the tier
 * unorderable — the state `availabilityOf` reports as `not_orderable`.
 */
export function ticketDraftNotes(draft: TicketDraft): string[] {
  const notes: string[] = [];
  if (parseWholeNumber(draft.max_per_order) === 0) {
    notes.push(
      'A maximum of 0 per order means no basket may contain this tier. It will be listed and never sold.',
    );
  }
  if (!draft.is_active) {
    notes.push('Inactive tiers stay on the event and in past orders, but cannot be bought.');
  }
  return notes;
}

// -----------------------------------------------------------------------------
// Draft -> columns
// -----------------------------------------------------------------------------

function ticketColumnsFrom(
  draft: TicketDraft,
  timeZone: string,
): Omit<TicketTypeInsert, 'event_id'> {
  const priceCents = parseAmountToCents(draft.price);
  const maxPerOrder = parseWholeNumber(draft.max_per_order);
  if (priceCents === null || maxPerOrder === null) {
    throw new Error('ticketColumnsFrom called with an unvalidated draft.');
  }

  return {
    name: draft.name.trim(),
    description: draft.description.trim().length === 0 ? null : draft.description.trim(),
    price_cents: priceCents,
    currency: normaliseCurrency(draft.currency),
    quantity: parseWholeNumber(draft.quantity),
    max_per_order: maxPerOrder,
    sales_start_at: isPartsEmpty(draft.sales_start)
      ? null
      : partsToUtcIso(draft.sales_start, timeZone),
    sales_end_at: isPartsEmpty(draft.sales_end) ? null : partsToUtcIso(draft.sales_end, timeZone),
    is_active: draft.is_active,
  };
}

export function ticketDraftToInsert(
  draft: TicketDraft,
  eventId: string,
  timeZone: string,
): TicketTypeInsert {
  return { ...ticketColumnsFrom(draft, timeZone), event_id: eventId };
}

/** `quantity_sold` is deliberately absent — only checkout may move it. */
export function ticketDraftToUpdate(draft: TicketDraft, timeZone: string): TicketTypeUpdate {
  return ticketColumnsFrom(draft, timeZone);
}

// -----------------------------------------------------------------------------
// Cross-tier rules
// -----------------------------------------------------------------------------

/**
 * The currency a new or edited tier must use, or null when the choice is open.
 *
 * Only *other* tiers count, so editing the only tier on an event can still
 * change its currency. Inactive tiers are ignored: they cannot be bought, so
 * they cannot contribute to a mixed basket.
 */
export function lockedCurrencyFor(
  tickets: readonly TicketType[],
  editingId: string | null,
): string | null {
  const others = tickets.filter((ticket) => ticket.is_active && ticket.id !== editingId);
  const distinct = [...new Set(others.map((ticket) => normaliseCurrency(ticket.currency)))];
  return distinct[0] ?? null;
}

/**
 * Currencies already in use across the active tiers. More than one means the
 * event is unbuyable until a host fixes it, which the tickets tab says out
 * loud — the lock above prevents new ones, but rows created before it existed
 * (or through the web app) can still arrive mixed.
 */
export function activeCurrencies(tickets: readonly TicketType[]): string[] {
  return [
    ...new Set(
      tickets.filter((ticket) => ticket.is_active).map((ticket) => normaliseCurrency(ticket.currency)),
    ),
  ];
}
